/*
  Google Drive image upload bridge for Biserry Groceries OS.

  STEP 1:
  Deploy the Google Apps Script as a Web App.

  STEP 2:
  Replace GOOGLE_DRIVE_UPLOAD_URL below with your deployed Apps Script Web App URL.
*/

export const GOOGLE_DRIVE_UPLOAD_URL = "https://script.google.com/macros/s/AKfycbxJlljQAW6EEfrqKj9yCMJ3PqxQUiy9GgmucxKv-zvTx8x_LTpJAZfu80xZVVchEWgu/exec";

export function isGoogleDriveUploadConfigured() {
  return (
    GOOGLE_DRIVE_UPLOAD_URL &&
    GOOGLE_DRIVE_UPLOAD_URL.startsWith("https://script.google.com/")
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };

    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export async function uploadImageToGoogleDrive(file) {
  if (!file) return "";

  if (!isGoogleDriveUploadConfigured()) {
    throw new Error(
      "Google Drive upload URL is not configured. Open js/google-drive-upload.js and paste your Apps Script Web App URL."
    );
  }

  const base64 = await fileToBase64(file);

  const response = await fetch(GOOGLE_DRIVE_UPLOAD_URL, {
    method: "POST",
    body: JSON.stringify({
      fileName: `${Date.now()}-${file.name}`.replace(/[^a-zA-Z0-9._-]/g, "-"),
      mimeType: file.type || "image/png",
      base64
    })
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || "Google Drive image upload failed.");
  }

  return result.directUrl || result.viewUrl;
}
