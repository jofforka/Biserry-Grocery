# Biserry Grocery — AI Catalogue Manager v2

This package preserves the Biserry storefront/admin app and upgrades Bulk Upload into a staged catalogue-management workflow.

## Recommended catalogue workflow
1. Open **Admin → Bulk Upload**.
2. Analyze `data/biserry-1200-master-catalogue-v2.csv` or a supplier CSV.
3. For an unattended enrichment workflow, choose **Queue for Backend AI Enrichment** instead of immediately publishing uncertain rows.
4. Firebase Functions enrich missing brand/pack/retail-reference/image fields using source-page metadata and, when needed, Gemini Search grounding.
5. High-confidence rows can be processed automatically; uncertain rows go to the exception/review queue.

See `AI-CATALOGUE-MANAGER.md` for setup, pricing rules, image-source policy, and the `GEMINI_API_KEY` Firebase secret deployment step.
