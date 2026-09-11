# Firebase Functions for Zapier integration

## 1) Deploy functions

```bash
cd functions
npm install
firebase login
firebase deploy --only "functions" --project quanlynlchanhthu
```

## 2) Set environment variables

Set these in Firebase Functions config before using email sending:

```bash
firebase functions:config:set \
  gmail.user="your-gmail@gmail.com" \
  gmail.pass="your-app-password"
```

Then read them in code as:

```js
process.env.GMAIL_USER
process.env.GMAIL_PASS
process.env.ZAPIER_SECRET
```

## 2) Your webhook endpoint

After deploy, the function URL will look like:

```text
https://asia-southeast1-<project-id>.cloudfunctions.net/zapierWebhook
```

Use this in Zapier as a webhook action.

Headers:

```http
Authorization: Bearer replace-with-your-secret
Content-Type: application/json
```

Example payload:

```json
{
  "eventType": "production_created",
  "data": {
    "team": "A",
    "totalBtp": 80,
    "productionDate": "2026-09-11"
  }
}
```

## 3) Save to Firestore

The function stores incoming payloads in collection:

```text
zapierInbound
```

## 4) Send report mail endpoint

```text
https://asia-southeast1-<project-id>.cloudfunctions.net/sendProductionReport
```

Example body:

```json
{
  "recipients": ["user1@gmail.com", "user2@gmail.com"],
  "subject": "Báo cáo ngày 11/09/2026",
  "html": "<h1>Báo cáo</h1><p>Nội dung</p>",
  "reportDate": "2026-09-11"
}
```
