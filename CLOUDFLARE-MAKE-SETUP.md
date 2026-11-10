# نشر Cloudflare Worker وربطه بـMake

هذا الإعداد يضيف وسيطًا خلفيًا يحتفظ بعنوان Make السري كـCloudflare Secret. لا يُحفظ عنوان Make في ملفات الموقع العامة. يحسب الوسيط المسافة مرة أخرى على الخادم ويتحقق من أصل الموقع والبيانات قبل تمرير حدث الابتعاد.

## الملفات

- `worker.js`: وسيط Cloudflare Worker لمسار `/location-alert`.
- `wrangler.toml`: اسم Worker وأصل GitHub Pages المسموح.
- `location-tracker.js`: يرسل حدثًا بعد موافقة المستخدم وخروجه المؤكد عن نطاق 100 متر.

## إعداد سيناريو Make

1. في Make، أنشئ Scenario جديدًا.
2. أضف **Webhooks → Custom webhook** وأنشئ webhook جديدًا.
3. انسخ عنوان الـwebhook لاستخدامه كـSecret في Cloudflare، ولا تضعه في GitHub أو المتصفح.
4. اضغط **Run once** ثم أرسل اختبارًا من Worker بعد نشره، أو استخدم بيانات اختبار تتضمن `event=left_restaurant_radius` وحقول الموقع.
5. بعد التقاط عينة البيانات، أضف خطوة الإشعار التي تريدها (مثل بريد أو قناة إشعارات متاحة في حسابك). حدّد المستلم الثابت داخل إعداد Make، ولا تقبل رقم المستلم من بيانات الطلب.
6. فعّل السيناريو واختبر وصول إشعار تجريبي. تجنب تسجيل أو الاحتفاظ بإحداثيات دقيقة أكثر من اللازم.

## نشر Worker من جهازك/جلسة Cloudflare

يتطلب النشر تسجيل دخول إلى حساب Cloudflare. لا أملك صلاحية الدخول إلى حسابك أو إنشاء أسراره من هذا المستودع، لذلك لا يمكنني نشره نيابة عنك.

1. ثبّت Node.js، ثم Wrangler:
   `npm install --global wrangler`
2. من جذر المشروع سجّل الدخول:
   `wrangler login`
3. اضبط رابط Make كـSecret تفاعليًا (الصقه في الطرفية عند الطلب ولا تحفظه في ملف):
   `wrangler secret put MAKE_WEBHOOK_URL`
4. انشر Worker:
   `wrangler deploy`
5. سيعرض Wrangler عنوانًا عامًا مثل `https://vip-card-location-alert.<your-subdomain>.workers.dev`.
6. حدّث `LOCATION_ALERT_ENDPOINT` في `location-tracker.js` إلى عنوان Worker مع المسار `/location-alert`، مثال شكلي فقط:
   `https://vip-card-location-alert.<your-subdomain>.workers.dev/location-alert`
   لا تضع عنوان Make هنا.
7. أرسل التغيير إلى GitHub وانتظر تحديث GitHub Pages. اختبر على HTTPS، مع موافقة الموقع والإشعارات.

## حماية إضافية لازمة

- تقييد CORS في Worker لا يمنع الطلبات المصطنعة من أدوات خارج المتص��ح. فعّل Cloudflare rate limiting/WAF على مسار `/location-alert`، وراقب الاستهلاك.
- لا يوجد ضمان «أمان كامل»؛ أي واجهة عامة يمكن إساءة استخدامها. أضف Turnstile أو آلية تحقق/تحديد معدل مناسبة قبل اعتمادها تجاريًا.
- غيّر Webhook الحجز الظاهر حاليًا في JavaScript العام في `index.html` إذا كان سريًا أو يقبل طلبات غير مرغوبة، وانقله إلى وسيط خلفي كذلك.
- الإشعارات والاهتزاز يعتمدان على إذن المتصفح والجهاز. التتبع يتوقف عند إغلاق الصفحة أو مغادرتها.
- احصل على موافقة المستخدم قبل المتابعة والإرسال، ووضح الغرض وسياسة الاحتفاظ بالبيانات.
