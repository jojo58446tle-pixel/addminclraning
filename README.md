# Admin Cleaning

Mobile-first Admin Quick Reply Control Panel สำหรับเลือก ตรวจสอบ และยืนยันข้อความก่อนส่งเข้ากลุ่ม DingTalk

เวอร์ชันนี้เปิดหน้าใช้งานได้โดยตรงตามข้อกำหนดล่าสุด: **ไม่มีหน้า Login และไม่ต้องใส่ Username/Password** ระบบยังคงไม่ตรวจจับรูป ไม่ตอบอัตโนมัติ ไม่มี Scheduled Function และจะไม่ส่งข้อความจนกว่าผู้ใช้จะกด “ยืนยันการส่ง”

## Flow

1. เปิด Web App แล้วเข้าหน้าส่งข้อความทันที
2. เลือก Quick Reply จาก 5 Action ที่อนุญาต
3. ระบบเปิด Preview โดยยังไม่เรียก Backend
4. กด “ยืนยันการส่ง”
5. Backend ตรวจ Origin, Whitelist, Rate Limit และล็อก Client Request ID
6. Netlify Backend Map ข้อความและส่ง DingTalk Webhook โดยตรง
7. บันทึกสถานะ SUCCESS, FAILED หรือ UNKNOWN

```text
Mobile Browser
  -> POST /api/quick-reply (action + requestId)
Netlify Next.js Function
  -> Origin / Whitelist / Rate Limit / Idempotency
  -> DingTalk Webhook
DingTalk Workflow/Robot -> Company Group
```

Webhook, Token และ Secret อยู่ฝั่ง Server เท่านั้น Frontend ส่งข้อความอิสระไม่ได้

## Technology

- Next.js App Router + React
- Netlify Next.js adapter และ Server-side API Routes
- Netlify Blobs แบบ strong consistency สำหรับ Request ID, Rate Limit และ History
- Netlify Server Function ส่งเข้า DingTalk โดยตรง
- Node.js 22 ขึ้นไป

## Environment Variables

ตั้งค่าที่ Netlify: `Site configuration > Environment variables` และให้ Scope ครอบคลุม Functions

| Variable | Required | รายละเอียด |
| --- | --- | --- |
| `DINGTALK_WEBHOOK_URL` | Yes | URL Custom Robot เดิมที่ขึ้นต้นด้วย `https://oapi.dingtalk.com/robot/send` |
| `DINGTALK_WEBHOOK_MODE` | Recommended | ใช้ `robot_markdown` |
| `PUBLIC_APP_ORIGIN` | Recommended | Origin จริง เช่น `https://example.netlify.app` |
| `LOCAL_STORAGE_MODE` | Local only | ใช้ `memory` เฉพาะเครื่องพัฒนา ห้ามตั้งบน Production |

ตัวอย่างอยู่ใน `.env.example`

ไม่ต้องใช้ Google Apps Script, `GAS_ENDPOINT_URL` หรือ `GAS_SHARED_SECRET` ในโหมดนี้

## Google Apps Script แบบเดิม (Legacy fallback)

ส่วนนี้ไม่จำเป็นสำหรับการติดตั้งใหม่ ใช้เฉพาะกรณีที่องค์กรบังคับให้ส่งผ่าน Google Apps Script เท่านั้น

ใช้ไฟล์ `google-apps-script/AdminCleaningQuickReply.gs` เวอร์ชันนี้ส่ง Webhook ได้ด้วยตัวเอง ไม่ต้องมีฟังก์ชัน `sendDingTalk()` จากระบบเดิม

### 1. เพิ่มไฟล์โดยไม่แตะ Scheduler

เปิด Apps Script เดิม เพิ่มไฟล์ `.gs` ใหม่ แล้วคัดลอกโค้ดจากไฟล์ที่เตรียมไว้ โค้ดนี้ไม่แก้หรือสร้าง Trigger และไม่แก้ Logic ของ Daily Cleaning, Weekly Cleaning, Smoking Weekly หรือ Smoking Monthly

หากโปรเจกต์เดิมมี `doPost(e)` อยู่แล้ว ห้ามสร้างซ้ำ ให้เพิ่ม Route นี้ใน `doPost` เดิม:

```javascript
const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
if (payload.source === "admin-cleaning") {
  return handleAdminCleaningQuickReply(e);
}
```

### 2. ตั้ง Script Properties

ไปที่ `Project Settings > Script Properties` แล้วเพิ่ม:

```text
ADMIN_CLEANING_SHARED_SECRET = <ค่าเดียวกับ GAS_SHARED_SECRET บน Netlify>
ADMIN_CLEANING_DINGTALK_WEBHOOK_URL = <Webhook URL จาก DingTalk>
ADMIN_CLEANING_DINGTALK_MODE = workflow_text
```

กรณีที่ใช้ DingTalk Custom Robot ให้เปลี่ยน Mode เป็น `robot_text` หรือ `robot_markdown` ส่วน Workflow ที่ตั้ง `Parameter format = Text` ให้ใช้ `workflow_text`

ห้ามเขียน Secret ลงในไฟล์ `.gs`

### 3. Deploy Web App

1. กด Deploy > New deployment
2. เลือก Web app
3. Execute as: เจ้าของ Script
4. ตั้งสิทธิ์ให้ Netlify Backend เรียก Web App ได้
5. Copy URL ที่ลงท้ายด้วย `/exec`
6. ใส่ URL ใน `GAS_ENDPOINT_URL` บน Netlify

ใช้ URL `/exec` ของ Deployment จริง ไม่ใช้ `/dev`

## Deploy บน Netlify

1. Push โปรเจกต์ขึ้น GitHub/GitLab หรือ Upload ZIP ตามขั้นตอนของ Netlify
2. Netlify อ่าน `netlify.toml` อัตโนมัติ
3. เพิ่ม Environment Variables ก่อน Deploy
4. Deploy

ค่าที่เตรียมไว้:

```text
Build command: npm run build:netlify
Publish directory: .next
Node: 22
```

## Local Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

คง `LOCAL_STORAGE_MODE=memory` ไว้เฉพาะ Local เท่านั้น Production จะใช้ Netlify Blobs

## Validation

```bash
npm run test:unit
npm run lint
npm run build:netlify
```

Tests ตรวจ Action Whitelist และการ Reserve Request ID แบบ Atomic เพื่อป้องกันการส่งซ้ำ

## API Contract

### `POST /api/quick-reply`

```json
{
  "action": "thank",
  "requestId": "client-generated-uuid"
}
```

ไม่รับ `message`, `title`, `webhook` หรือ URL จาก Frontend

### `GET /api/history`

คืนประวัติล่าสุดสูงสุด 20 รายการ

### `GET /api/status`

คืนสถานะว่าตั้งค่า Google Apps Script Endpoint แล้วหรือยัง โดยไม่เปิดเผย URL หรือ Secret

## Safety Behavior

- แตะ Quick Reply Card: เปิด Preview เท่านั้น
- กด Confirm: ปุ่มถูก Disable ก่อนเรียก API
- Request ID ถูก Reserve แบบ Atomic ก่อนเรียก Apps Script
- Request ID ซ้ำ: Backend คืนผลเดิมหรือปฏิเสธ และไม่เรียก DingTalk ซ้ำ
- Apps Script ตรวจ Request ID ซ้ำอีกชั้นด้วย Script Lock
- ไม่มี Automatic Retry ไป DingTalk
- Timeout/Response ไม่ชัดเจน: สถานะ UNKNOWN และแจ้งให้ตรวจ DingTalk
- Invalid Action: HTTP 400
- เกิน Rate Limit: HTTP 429

## Safe Go-live Checklist

1. ทดสอบครั้งแรกใน DingTalk Test Group ที่ไม่มีผู้บริหาร
2. กด Card แล้วตรวจว่า Modal เปิด แต่ยังไม่มีข้อความเด้ง
3. กด “ยกเลิก” แล้วตรวจว่าไม่มีข้อความเด้ง
4. กดยืนยันหนึ่งครั้ง และตรวจ History เป็น SUCCESS
5. ทดสอบกดรัวว่าปุ่มถูก Disable
6. ตรวจ Browser Source ว่าไม่มี Webhook หรือ Secret
7. ตรวจว่า Scheduler เดิมยังทำงานตามเวลาเดิม
8. เมื่อครบทุกข้อจึงเปลี่ยน `sendDingTalk` ไปยังกลุ่มบริษัทจริง

## Important

เวอร์ชันนี้ไม่มี Login ตามข้อกำหนดล่าสุด ผู้ที่เข้าถึง URL จะเปิด Control Panel ได้ทันที ควรจำกัดการแชร์ URL และใช้ Netlify Access Control ขององค์กรหากต้องการจำกัดผู้เข้าถึงโดยไม่เพิ่มรหัสในแอป

ห้ามนำ `.env.local`, DingTalk Webhook หรือ Apps Script Secret ขึ้น Git และห้ามใส่ค่าเหล่านี้ในตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_`
