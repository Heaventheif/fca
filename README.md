# fca-unofficial

هذه الحزمة مشروع غير رسمي للتعامل مع واجهات Messenger. الإصدار المرفق خضع لتدقيق محلي محدود يركز على سلامة البناء، حماية الملفات المحلية، وتهيئة الحالة دون اتصال خارجي.

## نطاق الاختبار

يشغّل `npm test` اختبارًا غير شبكي يتحقق من التصديرات العامة، تطبيع ملفات تعريف الارتباط، مخزن الحالة، وتهيئة السياق. لا يقرأ الاختبار أي ملف جلسة حقيقي، ولا ينفذ تسجيل الدخول، MQTT، Graph/API، أو إرسال الرسائل.

## الاستخدام المسؤول

لا تعتمد هذه الحزمة على تسجيل دخول حسابات شخصية أو على نقاط نهاية داخلية غير موثقة باعتبارها واجهة إنتاجية. لا تُستخدم لمحاكاة السلوك البشري، أو تدوير بصمات المتصفح، أو مطابقة بصمات TLS، أو تجاوز الحظر ومحددات المعدل. لا تُحفظ قيم الجلسة أو الرموز في المستودع، ويجب اعتبار أي ملف appstate أو cookie سرًا حساسًا.

للتكامل الإنتاجي مع Meta، استخدم Messenger Platform الرسمي، وطبّق Webhooks وPage access tokens والصلاحيات والمراجعات المطلوبة من Meta. تحقّق من شروط المنصة وسياسات المطوّرين قبل أي تشغيل.

## ملاحظات أمنية

يجب تشغيل العمليات ضمن حساب نظام مخصص، وحصر ملفات الحالة داخل مجلد العمل، وضبط صلاحياتها على المستخدم فقط. لا تُفعّل `remoteControl` إلا عند الحاجة، مع عنوان `wss://` موثوق ورمز وصول مستقل، ولا تمرر الأسرار إلى السجلات أو رسائل الأخطاء.

## الأوامر

```bash
npm ci --ignore-scripts
npm test
```

يؤدي `npm ci --ignore-scripts` إلى تثبيت الاعتماديات دون تشغيل سكربتات دورة الحياة أثناء التدقيق.

---

## التحسينات المُطبَّقة (v5.1.0-esm+fixed → patched)

> آخر تحديث: 17 أغسطس 2026

### ✅ الإصلاح 1 — CookieJar مُعزول لكل Context

**المشكلة:** `jar` كان singleton مُشترك — كوكيز الحساب A تتسرب لطلبات الحساب B في سيناريو multi-bot.

**الحل:** `createRequestCore(contextJar?)` تُعيد client مُعزول بـ jar خاص:

```javascript
import { createRequestCore } from 'fca-unofficial/lib/utils/request/client.js';

const botA = createRequestCore(); // jar خاص
const botB = createRequestCore(); // jar خاص — لا تداخل
```

### ✅ الإصلاح 2 — scrypt كـ KDF بدل SHA-256

**المشكلة:** `encryptionKey()` استخدمت SHA-256 (ينفَّذ في nanoseconds) — قابل للـ brute-force.

**الحل:** `crypto.scryptSync` مع `N=2^17` — يتطلب ~128 MB RAM/محاولة.

```bash
# تفعيل التشفير:
export FCA_JSON_STORE_KEY="entropy-here-min-32-chars"
```

### ✅ الإصلاح 3 — LRU Cache

PerformanceManager كان يستخدم FIFO. الآن يحذف الأقل استخداماً (LRU) عند امتلاء الـ cache.

### ✅ الإصلاح 4 — Type Definitions

ملفات `lib/types/*.js` (كانت 0 bytes) تحتوي الآن على JSDoc كامل لجميع أنواع البيانات والأحداث.

```javascript
import { FCA_EVENT } from 'fca-unofficial/lib/types/events.js';
bot.on(FCA_EVENT.MESSAGE, handler);  // بدل هاردكودنج 'message'
```

### ⚠️ تحذيرات مهمة

- هذه المكتبة **غير رسمية** وتنتهك شروط Facebook/Meta
- لا تضع credentials في `fca-config.json` — استخدم متغيرات البيئة
- `autoLogin=true` يرسل email/password لـ `apiServer` — تأكد أنه خادمك
