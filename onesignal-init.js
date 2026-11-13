(() => {
  'use strict';

  const ONESIGNAL_APP_ID = '0adbfbd2-0f76-494a-9be3-6507eb7eaae4';
  const SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  const BUTTON_ID = 'onesignalEnableNotifications';
  const BUTTON_LABEL = 'تفعيل إشعارات العروض';

  let oneSignal = null;
  let initPromise = null;

  function loadOneSignal() {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve, reject) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            serviceWorkerPath: '/vip-card/OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/vip-card/' }
          });
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

  function findPermissionButton() {
    const byId = document.getElementById(BUTTON_ID);
    if (byId) return byId;

    return Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent.trim().includes(BUTTON_LABEL)
    ) || null;
  }

  function showToast(message, isError = false) {
    let toast = document.getElementById('onesignalNotificationToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'onesignalNotificationToast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }

    toast.style.cssText = position:fixed;z-index:1001;inset-inline:16px;bottom:76px;margin-inline:auto;width:max-content;max-width:calc(100% - 32px);padding:11px 16px;border:1px solid ${isError ? '#ff8580' : '#73d39a'};border-radius:12px;background:${isError ? '#7a302d' : '#153b27'};color:#fff;font:600 14px/1.6 Cairo,Tahoma,sans-serif;box-shadow:0 6px 24px #0008;opacity:1;transform:translateY(0);transition:opacity .2s,transform .2s;
    toast.textContent = message;

    window.clearTimeout(toast.hideTimer);
    toast.hideTimer = window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
    }, 4500);
  }

  function setButtonState(button, state) {
    if (state === 'success') {
      button.textContent = '✅ تم تفعيل إشعارات العروض بنجاح';
      button.disabled = true;
      button.style.background = 'linear-gradient(135deg,#73d39a,#2e9b60)';
      button.style.borderColor = '#73d39a';
      button.style.color = '#102417';
      button.style.cursor = 'default';
      return;
    }

    if (state === 'active') {
      button.textContent = '✅ الإشعارات مفعلة';
      button.disabled = true;
      button.style.background = 'linear-gradient(135deg,#73d39a,#2e9b60)';
      button.style.borderColor = '#73d39a';
      button.style.color = '#102417';
      button.style.cursor = 'default';
      return;
    }

    if (state === 'blocked') {
      button.textContent = '⚠️ الإشعارات محظورة من المتصفح';
      button.disabled = true;
      button.style.background = '#7a302d';
      button.style.borderColor = '#ff8580';
      button.style.color = '#fff7e6';
      button.style.cursor = 'not-allowed';
      return;
    }

    if (state === 'loading') {
      button.textContent = 'جاري التفعيل...';
      button.disabled = true;
      button.style.cursor = 'wait';
      return;
    }

    button.textContent = BUTTON_LABEL;
    button.disabled = false;
    button.style.background = 'linear-gradient(135deg,#f6e5b2,#d6b66f)';
    button.style.borderColor = '#ffe9ad';
    button.style.color = '#19160a';
    button.style.cursor = 'pointer';
  }

  async function isSubscribed(OneSignal) {
    try {
      return OneSignal.User.PushSubscription.optedIn === true;
    } catch (error) {
      return false;
    }
  }

  function addPermissionButton() {
    let button = findPermissionButton();
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.setAttribute('aria-label', BUTTON_LABEL);
      button.style.cssText = [
        'position:fixed', 'z-index:999', 'inset-inline-end:16px', 'bottom:16px',
        'padding:11px 16px', 'border:1px solid #ffe9ad', 'border-radius:999px',
        'background:linear-gradient(135deg,#f6e5b2,#d6b66f)', 'color:#19160a',
        'font:700 14px Cairo,Tahoma,sans-serif', 'box-shadow:0 6px 24px #0008',
        'cursor:pointer'
      ].join(';');
      document.body.appendChild(button);
    }

    if (button.dataset.oneSignalClickBound === 'true') return button;
    if (!button.id) button.id = BUTTON_ID;
    button.dataset.oneSignalClickBound = 'true';

    button.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        showToast('متصفحك الحالي لا يدعم الإشعارات، افتح الموقع من Chrome أو Safari.', true);
        return;
      }

      setButtonState(button, 'loading');
      try {
        const OneSignal = await loadOneSignal();
        
        // استدعاء نافذة الإذن الأصلية للمتصفح مباشرة
        await OneSignal.Notifications.requestPermission();
        
        // التأكد من تفعيل الاشتراك
        if (Notification.permission === 'granted') {
          await OneSignal.User.PushSubscription.optIn();
        }

        if (await isSubscribed(OneSignal)) {
          setButtonState(button, 'success');
          showToast('مرحبًا بك! تم تفعيل إشعارات العروض بنجاح.');
          return;
        }

        if (Notification.permission === 'denied') {
          setButtonState(button, 'blocked');
          showToast('تم رفض الإشعارات، يرجى السماح بها من إعدادات المتصفح.', true);
          return;
        }

        setButtonState(button, 'ready');
      } catch (error) {
        console.error('OneSignal error:', error);
        showToast('حدث خطأ أثناء التفعيل، تأكد من إعدادات OneSignal.', true);
        setButtonState(button, 'ready');
      }
    });

    return button;
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
    text.textContent = 'أوافق اختياريًا على استخدام اسمي ورقم هاتفي كوسوم في OneSignal لتخصيص الإشعارات.';
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
        console.warn('Could not add optional OneSignal customer tags:', error);
      }
    });
  }

  async function start() {
    const button = addPermissionButton();
    addOptionalCustomerTagConsent();

    try {
      const OneSignal = await loadOneSignal();
      if (await isSubscribed(OneSignal)) {
        setButtonState(button, 'active');
      } else if ('Notification' in window && Notification.permission === 'denied') {
        setButtonState(button, 'blocked');
      }
    } catch (error) {
      console.warn('OneSignal initialization failed:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
