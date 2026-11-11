/*
 * Opt-in geolocation tracking with Haversine distance calculation.
 * Tracking starts only after the visitor explicitly accepts the welcome-screen
 * consent and invokes the VIP activation button (or uses the location button).
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

  const locateButton = originalLocateButton.cloneNode(true);
  originalLocateButton.replaceWith(locateButton);
  const consentLabel = document.createElement('label');
  consentLabel.className = 'small';
  consentLabel.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin:12px 0;';
  const consentCheckbox = document.createElement('input');
  consentCheckbox.type = 'checkbox';
  consentCheckbox.id = 'locationTrackingConsent';
  const consentText = document.createElement('span');
  consentText.textContent = 'أوافق على متابعة موقعي أثناء بقاء الصفحة مفتوحة وإرسال بيانات المسافة والإحداثيات لتنبيهات النطاق. يمكنني إيقاف المتابعة في أي وقت.';
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
  let firstPositionReported = false;

  function setLocationStatus(message, color) {
    locationStatus.textContent = message;
    if (color) locationStatus.style.color = color;
  }
  function announce(type, detail = {}) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }
  function distanceInMeters(lat1, lon1, lat2, lon2) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const radius = 6371000;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const latA = radians(lat1);
    const latB = radians(lat2);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
    const bounded = Math.min(1, Math.max(0, value));
    return 2 * radius * Math.atan2(Math.sqrt(bounded), Math.sqrt(1 - bounded));
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
  function notifyUser(title, message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: message, icon: './icon.svg', tag: 'restaurant-distance-alert' }); }
      catch (error) { console.warn('Could not display notification:', error); }
    }
    if ('vibrate' in navigator) navigator.vibrate([300, 150, 300]);
  }
  function renderCoordinates(position, distance) {
    const { latitude, longitude, accuracy } = position.coords;
    const info = document.createElement('p');
    info.textContent = `إحداثياتك: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} — دقة الموقع: نحو ${Math.round(accuracy)} متر — البعد عن المطعم: ${Math.round(distance)} متر`;
    const link = document.createElement('a');
    link.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'فتح موقعي في Google Maps';
    locationResult.replaceChildren(info, document.createElement('br'), link);
    locationResult.classList.remove('hidden');
  }
  async function sendExternalAlert(eventName, position, distance) {
    const { latitude, longitude, accuracy } = position.coords;
    const payload = new URLSearchParams({
      event: eventName,
      thresholdMeters: String(ALERT_RADIUS_METERS),
      latitude: String(latitude), longitude: String(longitude),
      accuracyMeters: String(Math.round(accuracy)),
      distanceFromRestaurantMeters: String(Math.round(distance)),
      occurredAt: new Date(position.timestamp).toISOString()
    });
    try {
      // A simple form POST avoids a CORS preflight. no-cors responses are opaque,
      // therefore the browser cannot verify whether Make processed the request.
      await fetch(LOCATION_ALERT_ENDPOINT, { method: 'POST', mode: 'no-cors', body: payload, keepalive: true });
    } catch (error) {
      console.error('Could not send external location alert:', error);
      setLocationStatus('تعذر إرسال الإشعار الخارجي؛ تحقق من اتصال الإنترنت وإعدادات Make.', '#ff7a7a');
    }
  }
  async function handlePosition(position) {
    const { latitude, longitude, accuracy } = position.coords;
    const distance = distanceInMeters(latitude, longitude, RESTAURANT_LAT, RESTAURANT_LNG);
    renderCoordinates(position, distance);
    if (!firstPositionReported) {
      firstPositionReported = true;
      announce('badyah:location-ready', { latitude, longitude, accuracyMeters: accuracy });
    }
    let state = null;
    if (distance - accuracy > ALERT_RADIUS_METERS) state = 'outside';
    else if (distance + accuracy <= ALERT_RADIUS_METERS) state = 'inside';
    if (state === null) {
      setLocationStatus(`الموقع قرب حد ${ALERT_RADIUS_METERS} متر، ودقة GPS (${Math.round(accuracy)} متر) لا تكفي للتأكد.`, '#d6b66f');
      return;
    }
    if (state === 'inside') setLocationStatus(`أنت داخل نطاق المطعم (${ALERT_RADIUS_METERS} متر). المسافة التقريبية ${Math.round(distance)} متر.`, '#7bdc96');
    else setLocationStatus(`تم تأكيد الابتعاد أكثر من ${ALERT_RADIUS_METERS} متر. المسافة التقريبية ${Math.round(distance)} متر.`, '#ff7a7a');
    if (lastConfirmedState === state) return;
    const previousState = lastConfirmedState;
    lastConfirmedState = state;
    if (state === 'outside') {
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
    const message = messages[error.code] || 'حدث خطأ أثناء تحديد الموقع.';
    console.error('Geolocation error:', error);
    announce('badyah:location-error', { message });
    stopWatching(message);
  }
  function startWatching() {
    if (!window.isSecureContext) {
      const message = 'ميزة الموقع تتطلب فتح الموقع عبر HTTPS.';
      setLocationStatus(message, '#ff7a7a'); announce('badyah:location-error', { message }); return;
    }
    if (!('geolocation' in navigator)) {
      const message = 'الموقع غير مدعوم في هذا المتصفح.';
      setLocationStatus(message, '#ff7a7a'); announce('badyah:location-error', { message }); return;
    }
    if (watchId !== null) return;
    firstPositionReported = false;
    lastConfirmedState = null;
    locateButton.disabled = true;
    stopButton.disabled = false;
    setLocationStatus('بانتظار إذن الموقع وتحديد أول قراءة…', '#d6b66f');
    // Call watchPosition directly from the user-initiated activation event.
    watchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
      enableHighAccuracy: true, timeout: 30000, maximumAge: 0
    });
  }

  locateButton.addEventListener('click', () => {
    if (!consentCheckbox.checked) {
      setLocationStatus('يرجى الموافقة على متابعة الموقع قبل بدء التتبع.', '#ff7a7a');
      return;
    }
    startWatching();
  });
  window.addEventListener('badyah:activate-vip', (event) => {
    if (event.detail?.consentGranted !== true) {
      announce('badyah:location-error', { message: 'يلزم قبول الموافقة الصريحة قبل تفعيل خدمات الموقع.' });
      return;
    }
    consentCheckbox.checked = true; // Consent was explicitly checked in the welcome overlay.
    startWatching();
  });
  stopButton.addEventListener('click', () => stopWatching());
  window.addEventListener('pagehide', () => {
    if (watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  });
})();
