(() => {
  'use strict';

  // ضع رمز APP_ID هنا
  const ONESIGNAL_APP_ID = 'YOUR_ONESIGNAL_APP_ID';
  const SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

  let oneSignal = null;
  let initPromise = null;

  function loadOneSignal() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({ appId: ONESIGNAL_APP_ID });
          oneSignal = OneSignal;
          resolve(OneSignal);
        } catch (error) {
          reject(error);
        }
      });

      const sdk = document.createElement('script');
      sdk.src = SDK_URL;
      sdk.async = true;
      sdk.onerror = () => reject(new Error('تعذر تحميل OneSignal SDK'));
      document.head.appendChild(sdk);
    });

    return initPromise;
  }

  function addPermissionButton() {
    if (document.getElementById('onesignalEnableNotifications')) return;

    const button = document.createElement('button');
    button.id = 'onesignalEnableNotifications';
    button.type = 'button';
    button.textContent = 'تفعيل إشعارات العروض';
    button.setAttribute('aria-label', 'تفعيل إشعارات العروض');
    button.style.cssText = [
      'position:fixed', 'z-index:999', 'inset-inline-end:16px', 'bottom:16px',
      'padding:11px 16px', 'border:1px solid #ffe9ad', 'border-radius:999px',
      'background:linear-gradient(135deg,#f6e5b2,#d6b66f)', 'color:#19160a',
      'font:700 14px Cairo,Tahoma,sans-serif', 'box-shadow:0 6px 24px #0008',
      'cursor:pointer'
    ].join(';');

    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const OneSignal = await loadOneSignal();
        await OneSignal.Slidedown.promptPush();
      } catch (error) {
        console.error('OneSignal permission prompt failed:', error);
      } finally {
        button.disabled = false;
      }
    });

    document.body.appendChild(button);
  }

  function addOptionalCustomerTagConsent() {
    const form = document.getElementById('loyaltyForm');
    if (!form || document.getElementById('onesignalCustomerTagConsent')) return;

    const label = document.createElement('label');
    label.id = 'onesignalCustomerTagConsent';
    label.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin:12px 0;color:#c7bca9;font:12px/1.8 Cairo,Tahoma,sans-serif';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'onesignalCustomerTagConsentInput';
    checkbox.style.cssText = 'margin-top:5px;accent-color:#e4c47d';

    const text = document.createElement('span');
    text.textContent = 'أوافق اختياريًا على استخدام اسمي ورقم هاتفي كوسوم في OneSignal لتخصيص الإشعارات. عدم الموافقة لا يؤثر على تفعيل البطاقة.';
    label.append(checkbox, text);

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.insertAdjacentElement('beforebegin', label);
    else form.appendChild(label);

    form.addEventListener('submit', async () => {
      if (!checkbox.checked) return;

      const name = document.getElementById('loyaltyNameInput')?.value?.trim();
      const phone = document.getElementById('loyaltyPhoneInput')?.value?.trim();
      if (!name && !phone) return;

      try {
        const OneSignal = oneSignal || await loadOneSignal();
        if (name) await OneSignal.User.addTag('customer_name', name);
        if (phone) await OneSignal.User.addTag('customer_phone', phone);
      } catch (error) {
        // Notification tags are optional and must never disrupt the existing form submission.
        console.warn('Could not add optional OneSignal customer tags:', error);
      }
    });
  }

  function start() {
    addPermissionButton();
    addOptionalCustomerTagConsent();

    // Displays OneSignal's soft prompt on entry. The visitor can still decline;
    // the persistent button remains available to opt in later.
    loadOneSignal()
      .then((OneSignal) => OneSignal.Slidedown.promptPush())
      .catch((error) => console.warn('OneSignal initialization failed:', error));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
