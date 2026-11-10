/*
 * Opt-in geolocation tracking and local departure alerts.
 * External alert delivery is disabled until this endpoint is configured.
 */
(() => {
  'use strict';

  const RESTAURANT_LAT = 28.3095;
  const RESTAURANT_LNG = 30.7123;
  const DEPARTURE_RADIUS_METERS = 100;
  // Replace only with the public URL of your deployed Cloudflare Worker.
  // Never put the Make webhook URL or its secret token in this public file.
  const LOCATION_ALERT_ENDPOINT = 'PLACEHOLDER_URL';

  const originalLocateButton = document.getElementById('locateBtn');
  const locationResult = document.getElementById('locationResult');
  const locationStatus = document.getElementById('locationStatus');

  if (!originalLocateButton || !locationResult || !locationStatus) {
    console.error('Location tracker: required location section elements were not found.');
    return;
  }

  // Replace the existing button to remove its one-shot geolocation handler while
  // preserving its markup, appearance, and all unrelated page functionality.
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
  consentText.textContent = 'أوافق على متابعة موقعي أثناء بقاء الصفحة مفتوحة. عند الابتعاد المؤكد أكثر من 100 متر، سيظهر تنبيه محلي، وقد تُرسل إحداثياتي إلى المطعم لإشعاره إذا تم إعداد الوسيط الآمن. يمكنني إيقاف المتابعة في أي وقت.';
  consentLabel.append(consentCheckbox, consentText);
  locateButton.insertAdjacentElement('afterend', consentLabel);

  const stopButton = document.createElement('button');
  stopButton.className = 'btn btn-outline';
  stopButton.type = 'button';
  stopButton.textContent = 'إيقاف متابعة الموقع';
  stopButton.disabled = true;
  consentLabel.insertAdjacentElement('afterend', stopButton);

  let watchId = null;
  let departureAlertSent = false;
  let notificationPermissionRequested = false;

  function setLocationStatus(message, color) {
    locationStatus.textContent = message;
    if (color) locationStatus.style.color = color;
  }

  function distanceInMeters(lat1, lon1, lat2, lon2) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const earthRadiusMeters = 6371000;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  function notifyDeparture(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('تنبيه موقع المطعم', {
          body: message,
          icon: './icon.svg',
          tag: 'restaurant-departure'
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
    info.textContent = `إحداثياتك: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} — الدقة التقريبية: ${Math.round(accuracy)} متر — البعد عن المطعم: ${Math.round(distance)} متر`;

    const mapLink = document.createElement('a');
    mapLink.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
    mapLink.target = '_blank';
    mapLink.rel = 'noopener noreferrer';
    mapLink.textContent = 'فتح موقعي في Google Maps';

    locationResult.replaceChildren(info, document.createElement('br'), mapLink);
    locationResult.classList.remove('hidden');
  }

  async function sendExternalAlert(position, distance) {
    if (
      !LOCATION_ALERT_ENDPOINT ||
      LOCATION_ALERT_ENDPOINT === 'PLACEHOLDER_URL'
    ) {
      return;
    }

    let endpoint;
    try {
      endpoint = new URL(LOCATION_ALERT_ENDPOINT);
      if (endpoint.protocol !== 'https:') {
        throw new Error('The location alert endpoint must use HTTPS.');
      }
    } catch (error) {
      console.error('Invalid location alert endpoint:', error);
      setLocationStatus('عنوان وسيط التنبيه غير صالح؛ تم عرض التنبيه المحلي فقط.', '#ff7a7a');
      return;
    }

    const { latitude, longitude, accuracy } = position.coords;
    try {
      const response = await fetch(endpoint.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'left_restaurant_radius',
          latitude,
          longitude,
          accuracyMeters: accuracy,
          distanceFromRestaurantMeters: Math.round(distance),
          occurredAt: new Date(position.timestamp).toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Could not send external location alert:', error);
      setLocationStatus('تم عرض التنبيه المحلي، لكن تعذر إرسال التنبيه الخارجي.', '#ff7a7a');
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
      distanceFromRestaurantMeters: Math.round(distance)
    });

    // Account for GPS uncertainty to avoid acting on an imprecise boundary reading.
    if (distance + accuracy <= DEPARTURE_RADIUS_METERS) {
      departureAlertSent = false;
      setLocationStatus(`أنت داخل نطاق المطعم (100 متر). دقة القراءة: نحو ${Math.round(accuracy)} متر.`, '#7bdc96');
      return;
    }

    if (distance - accuracy <= DEPARTURE_RADIUS_METERS) {
      setLocationStatus(`الموقع قرب حد النطاق، لكن دقة GPS الحالية (${Math.round(accuracy)} متر) لا تكفي للتأكد.`, '#d6b66f');
      return;
    }

    if (departureAlertSent) return;
    departureAlertSent = true;

    const message = `ابتعدت عن المطعم أكثر من ${DEPARTURE_RADIUS_METERS} متر. المسافة التقريبية ${Math.round(distance)} متر.`;
    setLocationStatus(message, '#ff7a7a');
    notifyDeparture(message);
    await sendExternalAlert(position, distance);
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
      setLocationStatus('يرجى الموافقة على متابعة الموقع قبل بدء التتبع.', '#ff7a7a');
      return;
    }
    if (watchId !== null) {
      setLocationStatus('متابعة الموقع تعمل بالفعل.', '#d6b66f');
      return;
    }

    await requestNotificationPermission();
    departureAlertSent = false;
    locateButton.disabled = true;
    stopButton.disabled = false;
    setLocationStatus('تتم متابعة موقعك بأفضل دقة متاحة. اترك الصفحة مفتوحة، ويمكنك إيقاف المتابعة في أي وقت.', '#d6b66f');

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
