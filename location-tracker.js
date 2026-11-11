/*
 * Opt-in geolocation tracking with Haversine distance calculation.
 * Sends a Make webhook alert when the visitor is confirmed more than 100 m
 * from the restaurant, and a return event when they are confirmed back within
 * that radius. Tracking runs only after explicit user consent.
 */
(() => {
  'use strict';

  const RESTAURANT_LAT = 28.3095;
  const RESTAURANT_LNG = 30.7123;
  const ALERT_RADIUS_METERS = 100;
  const LOCATION_ALERT_ENDPOINT = 'https://hook.eu1.make.com/pmtj8hmcen1m6chdyk9otwpykmqfu5p8';

  const originalLocateButton = document.getElementById('locateBtn');
  const locationResult = document.getElementById('locationResult');
  const locationStatus = document.getElementById('locationStatus');

  if (!originalLocateButton || !locationResult || !locationStatus) {
    console.error('Location tracker: required location section elements were not found.');
    return;
  }

  // Replace the page's original one-shot handler while preserving the button UI.
  const locateButton = originalLocateButton.cloneNode(true);
  originalLocateButton.replaceWith(locateButton);

  const consentLabel = document.createElement('label');
  consentLabel.className = 'small';
  consentLabel.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin:12px 0;';

  const consentCheckbox = document.createElement('input');
  consentCheckbox.type = 'checkbox';
  consentCheckbox.id = 'locationTrackingConsent';
  consentCheckbox.setAttribute('aria-describedby', 'locationConsentText');

  const consentText = document.createElement('span');
  consentText.id = 'locationConsentText';
  consentText.textContent = 'أوافق على متابعة موقعي أثناء بقاء الصفحة مفتوحة وإرسال إحداثياتي والمسافة إلى قرية البادية. سيُرسل تنبيه عند الابتعاد المؤكد أكثر من 100 متر أو العودة إلى النطاق. يمكنني إيقاف المتابعة في أي وقت.';
  consentLabel.append(consentCheckbox, consentText);
  locateButton.insertAdjacentElement('afterend', consentLabel);

  const stopButton = document.createElement('button');
  stopButton.className = 'btn btn-outline';
  stopButton.type = 'button';
  stopButton.textContent = 'إيقاف متابعة الموقع';
  stopButton.disabled = true;
  consentLabel.insertAdjacentElement('afterend', stopButton);

  let watchId = null;
  let lastConfirmedState = null;
  let notificationPermissionRequested = false;

  function setLocationStatus(message, color) {
    locationStatus.textContent = message;
    if (color) locationStatus.style.color = color;
  }

  // Haversine formula: returns the great-circle distance in meters.
  function distanceInMeters(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const earthRadiusMeters = 6371000;
    const latitudeDelta = toRadians(lat2 - lat1);
    const longitudeDelta = toRadians(lon2 - lon1);
    const latitude1 = toRadians(lat1);
    const latitude2 = toRadians(lat2);

    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(latitude1) * Math.cos(latitude2) *
      Math.sin(longitudeDelta / 2) ** 2;
    const boundedHaversine = Math.min(1, Math.max(0, haversine));

    return 2 * earthRadiusMeters * Math.atan2(
      Math.sqrt(boundedHaversine),
      Math.sqrt(1 - boundedHaversine)
    );
  }

  function stopWatching(message = 'تم إيقاف متابعة الموقع.') {
    if (watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    locateButton.disabled = false;
    stopButton.disabled = true;
    if (message) setLocationStatus(message, '#d6b66f');
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window) || notificationPermissionRequested) return;
    notificationPermissionRequested = true;
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.warn('Notification permission request failed:', error);
      }
    }
  }

  function notifyUser(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: './icon.svg',
          tag: 'restaurant-distance-alert'
        });
      } catch (error) {
        console.warn('Could not display notification:', error);
      }
    }
    if ('vibrate' in navigator) navigator.vibrate([300, 150, 300]);
  }

  function renderCoordinates(position, distance) {
    const { latitude, longitude, accuracy } = position.coords;
    const info = document.createElement('p');
    info.textContent = `إحداثياتك: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} — دقة الموقع: نحو ${Math.round(accuracy)} متر — البعد عن المطعم: ${Math.round(distance)} متر`;

    const mapLink = document.createElement('a');
    mapLink.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
    mapLink.target = '_blank';
    mapLink.rel = 'noopener noreferrer';
    mapLink.textContent = 'فتح موقعي في Google Maps';

    locationResult.replaceChildren(info, document.createElement('br'), mapLink);
    locationResult.classList.remove('hidden');
  }

  async function sendExternalAlert(eventName, position, distance) {
    const { latitude, longitude, accuracy } = position.coords;
    const payload = new URLSearchParams({
      event: eventName,
      thresholdMeters: String(ALERT_RADIUS_METERS),
      latitude: String(latitude),
      longitude: String(longitude),
      accuracyMeters: String(Math.round(accuracy)),
      distanceFromRestaurantMeters: String(Math.round(distance)),
      occurredAt: new Date(position.timestamp).toISOString()
    });

    try {
      // no-cors permits the browser to POST a simple form without a CORS preflight.
      // Its opaque response cannot confirm whether Make processed the request.
      await fetch(LOCATION_ALERT_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        body: payload,
        keepalive: true
      });
    } catch (error) {
      console.error('Could not send external location alert:', error);
      setLocationStatus('تعذر إرسال الإشعار الخارجي؛ تحقق من اتصال الإنترنت وإعدادات Make.', '#ff7a7a');
    }
  }

  async function handlePosition(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const distance = distanceInMeters(latitude, longitude, RESTAURANT_LAT, RESTAURANT_LNG);
    renderCoordinates(position, distance);

    console.log('Geolocation update:', {
      latitude,
      longitude,
      accuracyMeters: accuracy,
      thresholdMeters: ALERT_RADIUS_METERS,
      distanceFromRestaurantMeters: Math.round(distance)
    });

    // Account for GPS uncertainty; do not trigger near the 100 m boundary.
    let currentState = null;
    if (distance - accuracy > ALERT_RADIUS_METERS) {
      currentState = 'outside';
    } else if (distance + accuracy <= ALERT_RADIUS_METERS) {
      currentState = 'inside';
    }

    if (currentState === null) {
      setLocationStatus(`الموقع قرب حد ${ALERT_RADIUS_METERS} متر، ودقة GPS الحالية (${Math.round(accuracy)} متر) لا تكفي للتأكد.`, '#d6b66f');
      return;
    }

    if (currentState === 'inside') {
      setLocationStatus(`أنت داخل نطاق المطعم (${ALERT_RADIUS_METERS} متر). المسافة التقريبية ${Math.round(distance)} متر.`, '#7bdc96');
    } else {
      setLocationStatus(`تم تأكيد الابتعاد أكثر من ${ALERT_RADIUS_METERS} متر. المسافة التقريبية ${Math.round(distance)} متر.`, '#ff7a7a');
    }

    // Notify only on a confirmed state transition, not on every GPS update.
    if (lastConfirmedState === currentState) return;
    const previousState = lastConfirmedState;
    lastConfirmedState = currentState;

    if (currentState === 'outside') {
      const message = `تم تجاوز نطاق ${ALERT_RADIUS_METERS} متر عن المطعم. المسافة التقريبية ${Math.round(distance)} متر.`;
      notifyUser('تنبيه الابتعاد عن المطعم', message);
      await sendExternalAlert('exceeded_100m_radius', position, distance);
    } else if (previousState === 'outside') {
      const message = `عاد الموقع إلى نطاق ${ALERT_RADIUS_METERS} متر عن المطعم. المسافة التقريبية ${Math.round(distance)} متر.`;
      notifyUser('العودة إلى نطاق المطعم', message);
      await sendExternalAlert('returned_within_100m_radius', position, distance);
    }
  }

  function handlePositionError(error) {
    const messages = {
      1: 'لم يُسمح بالوصول إلى الموقع. تحقق من إذن المتصفح.',
      2: 'تعذر تحديد الموقع. تحقق من تشغيل GPS وحاول مجددًا.',
      3: 'انتهت مهلة تحديد الموقع. حاول مجددًا.'
    };
    console.error('Geolocation error:', error);
    stopWatching(messages[error.code] || 'حدث خطأ أثناء تحديد الموقع.');
  }

  locateButton.addEventListener('click', async () => {
    if (!window.isSecureContext) {
      setLocationStatus('ميزة الموقع تتطلب فتح الموقع عبر HTTPS.', '#ff7a7a');
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocationStatus('الموقع غير مدعوم في هذا المتصفح.', '#ff7a7a');
      return;
    }
    if (!consentCheckbox.checked) {
      setLocationStatus('يرجى الموافقة على متابعة الموقع وإرسال بياناته قبل بدء التتبع.', '#ff7a7a');
      return;
    }
    if (watchId !== null) {
      setLocationStatus('متابعة الموقع تعمل بالفعل.', '#d6b66f');
      return;
    }

    await requestNotificationPermission();
    lastConfirmedState = null;
    locateButton.disabled = true;
    stopButton.disabled = false;
    setLocationStatus('تتم متابعة موقعك بعد موافقتك. اترك الصفحة مفتوحة، ويمكنك إيقاف المتابعة في أي وقت.', '#d6b66f');

    watchId = navigator.geolocation.watchPosition(
      handlePosition,
      handlePositionError,
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  });

  stopButton.addEventListener('click', () => stopWatching());

  window.addEventListener('pagehide', () => {
    if (watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  });
})();
