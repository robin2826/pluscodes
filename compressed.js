/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
  Constructor for the PlusCodes object. This gets the URL and initial
  code, and initialises the map and compass.
  @this CompassController
 */
function CompassController(compassElement) {
  // DOM element containing the compass.
  this.compassElement = compassElement;
  // The origin location as [lat, lng].
  this.origin = null;
  // The destination location as [lat, lng]. (If null, display nothing.)
  this.destination = null;
  // Current compass heading out of the top of the device.
  this.deviceHeading = 0;
  // Compass display object.
  this.compassDisplay = null;
  // Log the compass readings received in 5 deg buckets. Used to see
  // if the compass is actually working.
  this.readingBuckets = {};
  this.bucketCount = 0;
}

// Number of compass buckets required to be valid.
CompassController._VALID_THRESHOLD = 40;
// Key for local storage.
CompassController.COMPASS_VALID = 'plus.codes.compass.valid';

/** Returns if orientation is supported by this browser/device. */
CompassController.prototype.isSupported = function() {
  return 'DeviceOrientationEvent' in window;
};

/** Returns if orientation data appears good. */
CompassController.prototype.appearsGood = function() {
  if (this.bucketCount >= CompassController._VALID_THRESHOLD) {
    return true;
  }
  return false;
};

/** Returns if a VALID compass has been previously registered. */
CompassController.prototype.hasReceived = function() {
  return DataStore.has(CompassController.COMPASS_VALID);
};

/**
  Set up the compass controller.
  @return {boolean} True if the browser supports deviceorientation event.
 */
CompassController.prototype.initialise = function() {
  // Add the elements within the container.
  this.canvas = document.createElement('canvas');
  this.canvas.classList.add('compass-base-canvas');
  this.compassElement.appendChild(this.canvas);

  // Get minimum of the height or width of the compass element.
  var dim = Math.min(this.compassElement.offsetWidth,
                     this.compassElement.offsetHeight);
  dim = Math.min(dim, 800) - 20;
  this.canvas.height = dim;
  this.canvas.width = dim;

  this.origin = null;
  this.deviceHeading = 0;
  this.targetCode = null;
  this.targetArea = null;
  this.compassDisplay = new CompassDisplay(
      this.canvas, '#888888', '#f06292', '#ffffff');
  // Register for compass update events.
  var that = this;
  window.addEventListener('deviceorientation',
      function(e) { that._receiveOrientationUpdate(e);}, false);
  return true;
};

/**
 * Called when displaying the compass. Checks if it works, and if not,
 * walks the user through the validation steps.
 */
CompassController.prototype.checkOperation = function() {
  if (DataStore.has(CompassController.COMPASS_VALID)) {
    return;
  }
  compassCheckDisplay();
};

/**
 * Show direction and distance information from one position to another.
 */
CompassController.prototype.setPoints = function(
    fromLat, fromLng, toLat, toLng) {
  this.origin = [fromLat, fromLng];
  if (toLat != null && toLng != null) {
    this.destination = [toLat, toLng];
  } else {

    this.destination = [fromLat, fromLng];
  }
  this._updateDisplay();
};

/**
  Handle an orientation update.
  @param {object} event A deviceorientation event.
 */
CompassController.prototype._receiveOrientationUpdate = function(event) {
  if (event.absolute === true && event.alpha !== null) {
    var heading = 0;
    //Check for iOS property
    if (event.webkitCompassControllerHeading) {
      heading = event.webkitCompassControllerHeading;
    } else {
      // Android Chrome, FF and Opera all report the heading
      // as a mirror of the real world.
      heading = 360 - event.alpha;
    }
    // Save the heading in a bucket and update the storage.
    var roundedHeading = Math.round(heading);
    if (this.bucketCount < CompassController._VALID_THRESHOLD &&
        !(roundedHeading in this.readingBuckets)) {
      this.readingBuckets[Math.round(heading)] = true;
      this.bucketCount++;
      if (this.bucketCount >= CompassController._VALID_THRESHOLD) {
        DataStore.putString(CompassController.COMPASS_VALID, 'true');
      }
    }
    if (heading - this.deviceHeading > 180) {
      this.deviceHeading = this.deviceHeading + 360;
    } else if (this.deviceHeading - heading > 180) {
      heading = heading + 360;
    }
    // Low-pass filter for heading.
    heading = this.deviceHeading + 0.25 * (heading - this.deviceHeading);
    heading = heading % 360;
    if (this.deviceHeading === null ||
        Math.abs(heading - this.deviceHeading) > 1) {
      this.deviceHeading = heading;
      this._updateDisplay();
    }
  }
};

/** Display distance and heading to target. */
CompassController.prototype._updateDisplay = function() {
  if (this.origin === null) {
    $('#compass_distance').html(messages.get('waiting-location'));
    return;
  }
  if (this.destination === null) {
    return;
  }
  var distance = CompassController._earthDistance(
      this.origin[0], this.origin[1],
      this.destination[0], this.destination[1]);
  var units;
  if (distance > 5000) {
    distance = Math.round(distance / 1000);
    units = messages.get('units-km');
  } else if (distance > 1000) {
    distance = Math.round(distance / 100) / 10;
    units = messages.get('units-km');
  } else {
    distance = Math.round(distance);
    units = messages.get('units-meters');
  }
  var bearing = CompassController._bearingTo(
      this.origin[0], this.origin[1],
      this.destination[0], this.destination[1]);
  bearing = CompassController._getBearingFromDevice(
      this.deviceHeading, bearing);
  this.compassDisplay.display(bearing, distance, units);
};

/**
  Compute distance between two locations.
  @param {number} lat1 The latitude of the first location.
  @param {number} lng1 The longitude of the first location.
  @param {number} lat2 The latitude of the second location.
  @param {number} lng2 The longitude of the second location.
  @return {number} The distance between locations in meters.
 */
CompassController._earthDistance = function(lat1, lng1, lat2, lng2) {
  var toRadians = Math.PI / 180;
  // Earth radius in meters
  var radius = 6371000;
  var lat1Rad = lat1 * toRadians;
  var lng1Rad = lng1 * toRadians;
  var lat2Rad = lat2 * toRadians;
  var lng2Rad = lng2 * toRadians;
  var latDiff = lat2Rad - lat1Rad;
  var lngDiff = lng2Rad - lng1Rad;

  var a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
          Math.cos(lat1Rad) * Math.cos(lat2Rad) *
          Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * radius;
};

/**
 Compute bearing from one location to another.
  @param {number} lat1 The latitude of the first location.
  @param {number} lng1 The longitude of the first location.
  @param {number} lat2 The latitude of the second location.
  @param {number} lng2 The longitude of the second location.
  @return {number} The bearing from the first location to the second.
 */
CompassController._bearingTo = function(lat1, lng1, lat2, lng2) {
  var toRadians = Math.PI / 180;
  var lat1Rad = lat1 * toRadians;
  var lat2Rad = lat2 * toRadians;
  var lngDiff = (lng2 - lng1) * toRadians;
  var y = Math.sin(lngDiff) * Math.cos(lat2Rad);
  var x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
          Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(lngDiff);
  var theta = Math.atan2(y, x);
  return ((theta * 180 / Math.PI) + 360) % 360;
};

/**
  Given an absolute bearing and the bearing of the device, work out the
  bearing relative to the device.
  @param {number} deviceBearing The bearing the device is pointing in.
  @param {number} targetBearing The bearing to the target location.
  @return {number} the bearing relative to the device heading to the target.
 */
CompassController._getBearingFromDevice = function(
    deviceBearing, targetBearing) {
  // TODO: It would be nice to correct this based on mobile device orientation.
  // A landscape Android device doesn't change the axis used for the device
  // orientation, but for the user, it's changed by 90 degrees.
  return (targetBearing - deviceBearing + 360) % 360;
};
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
  Display a compass indicator in the screen, and allow it to be controlled.
  @param {string} canvas DOM element of the canvas with text etc.
  @param {string} outline_color Web color spec for the compass outline.
  @param {string} indicator_color Web color spec for the compass indicator.
  @param {string} text_color Web color spec for the text.
  @this CompassDisplay
 */
function CompassDisplay(
    canvas, outline_color,
    indicator_color, text_color) {
  this.canvas = canvas;
  this.outline_color = outline_color;
  this.indicator_color = indicator_color;
  this.text_color = text_color;
  // Get the width and height so we can use it later.
  this.canvas_width = this.canvas.width;
  this.canvas_height = this.canvas.height;
  this.compass_radius = this.canvas_width / 2 - 50;

  this.drawRing();
  // We use custom (small) font sizes here.
  var context = this.canvas.getContext('2d');
  // Draw the top line (large!)
  context.font = 'bold 20pt Arial,sans-serif';
  context.textAlign = 'center';
  context.fillStyle = this.text_color;
  context.fillText(
      messages.get('waiting-for-compass-1'),
      this.canvas_width / 2,
      this.canvas_height / 2 - 15);
  // Second line, font slightly smaller.
  context.font = 'bold 20pt Arial,sans-serif';
  context.fillText(
      messages.get('waiting-for-compass-2'),
      this.canvas_width / 2,
      this.canvas_height / 2 + 15);

}

CompassDisplay.prototype.drawRing = function() {
  var context = this.canvas.getContext('2d');
  context.beginPath();
  context.arc(
      this.canvas_width / 2,
      this.canvas_height / 2,
      this.compass_radius,
      0,
      2 * Math.PI,
      false);
  context.lineWidth = 2;
  context.strokeStyle = this.outline_color;
  context.stroke();
};

/**
  Display an indicator at an angle in degrees, where 0 is straight out the
  top of the device.
  @param {number} angle The angle to the indicator.
  @param {string} text1 The upper text to display.
  @param {string} text2 The lower text to display.
 */
CompassDisplay.prototype.display = function(angle, text1, text2) {
  // Adjust the angle and convert to radians.
  angle = angle - 90;
  var start = (angle - 10) * (Math.PI / 180);
  var end = (angle + 10) * (Math.PI / 180);
  // Clear the canvas.
  var context = this.canvas.getContext('2d');
  context.clearRect(0, 0, this.canvas_width, this.canvas_height);
  this.drawRing();
  // Draw the indicator.
  context.beginPath();
  context.arc(
      this.canvas_width / 2,
      this.canvas_height / 2,
      this.compass_radius,
      start,
      end,
      false);
  context.lineWidth = 35;
  context.strokeStyle = this.indicator_color;
  context.stroke();
  // Draw the top line (large!)
  context.font = 'bold 60pt Arial,sans-serif';
  context.textAlign = 'center';
  context.fillStyle = this.text_color;
  context.fillText(text1, this.canvas_width / 2, this.canvas_height / 2 - 15);
  // Second line, font slightly smaller.
  context.font = 'bold 40pt Arial,sans-serif';
  context.fillText(text2, this.canvas_width / 2, this.canvas_height / 2 + 35);
};
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
  Provide methods to store and retrieve simple data.

  This uses the HTML5 localstore. If not available, falls back to cookies.
 */
function DataStore() {}

DataStore.has = function(key) {
  if (DataStore._localStorage() && DataStore._localStorageGet(key) != null) {
    return true;
  }
  if (DataStore._cookieGet(key) != null) {
    return true;
  }
  return false;
};

DataStore.get = function(key) {
  var value = null;
  if (DataStore._localStorage()) {
    value = DataStore._localStorageGet(key);
    if (value != null) {
      return value;
    }
  }
  value = DataStore._cookieGet(key);
  // Should we move this from a cookie into localstorage?
  if (value !== null && DataStore._localStorage()) {
    DataStore._localStoragePut(key, value);
    DataStore._cookieClear(key);
  }
  return value;
};

/**
  Save a string. If localstoreonly is true, the data will not fallback to
  the cookie store.
 */
DataStore.putString = function(key, value, localstoreonly) {
  if (typeof localstoreonly === 'undefined') {
    localstoreonly = false;
  }
  if (DataStore._localStorage()) {
    DataStore._localStoragePut(key, value);
    return;
  }
  if (localstoreonly) {
    return;
  }
  DataStore._cookiePut(key, value);
};

DataStore.clear = function(key) {
  if (DataStore._localStorage()) {
    DataStore._localStorageClear(key);
  }
  DataStore._cookieClear(key);
};

DataStore._cookiePut = function(key, value) {
  document.cookie = key + '=' + value + '; path=/';
};

DataStore._cookieGet = function(key) {
  var keyEQ = key + '=';
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1, c.length);
    }
    if (c.indexOf(keyEQ) == 0) {
      return c.substring(keyEQ.length, c.length);
    }
  }
  return null;
};

DataStore._cookieClear = function(key) {
  var value = DataStore._cookieGet(key);
  if (value === null) {
    return;
  }
  var date = new Date();
  date.setTime(date.getTime() - (1 * 24 * 60 * 60 * 1000));
  var expires = 'expires=' + date.toGMTString();
  var cookie = key + '=' + value + '; ' + expires + '; path=/';
  document.cookie = cookie;
};

DataStore._localStorage = function() {
  if ('localStorage' in window && window['localStorage'] !== null) {
    return true;
  }
  return false;
};

DataStore._localStoragePut = function(key, value) {
  localStorage[key] = value;
};

DataStore._localStorageGet = function(key) {
  if (!key in localStorage) {
    return null;
  }
  return localStorage[key];
};

DataStore._localStorageClear = function(key) {
  if (!key in localStorage) {
    return null;
  }
  localStorage.removeItem(key);
};
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
  Provide a Dialog class.

  Used to provide the same fadeIn/fadeOut functionality on all dialogs.
 */
function Dialog(id, jqueryContent, dismissCallback) {
  this.id = id;

  // Remove existing dialogs. Use id= match in case there are multiple elements
  // with matching ids.
  $('[id=' + id + '-dialog]').remove();
  $('[id=' + id + '-controls]').remove();
  $('[id=' + id + '-fader]').remove();
  // Add a fader - clicking on the fader will call the callback if passed,
  // or just dismisses the dialog.
  var fader = $('<div>').attr('id', id + '-fader').addClass('dialog-fader');
  if (typeof dismissCallback != 'undefined') {
    fader.click(dismissCallback);
  } else {
    var that = this;
    fader.click(function() {that.remove()});
  }
  $('body').append(fader);
  fader.fadeIn();
  // Add the control container (you'll have to populate them yourself).
  var controls = $('<div>').attr('id', id + '-controls')
      .addClass('dialog-controls');
  $('body').append(controls);
  $('#' + id + '-controls').fadeIn();

  var dialog = $('<section>').attr('id', id + '-dialog')
      .css('display', 'none')
      .addClass('dialog')
      .addClass('content')
      .append(jqueryContent);
  dialog.insertBefore($('#' + id + '-controls'));
  dialog.fadeIn('3000');
}

Dialog.prototype.addButton = function(jqueryObject) {
  $('#' + this.id + '-controls').append(jqueryObject);
  if (!isMobile()) {
    $('#' + this.id + '-controls').find('button')
        .mouseover(function() {$(this).addClass('highlight')})
        .mouseout(function() {$(this).removeClass('highlight')});
  }
};

Dialog.prototype.remove = function() {
  $('[id=' + this.id + '-dialog]').fadeOut(function() {$(this).remove()});
  $('[id=' + this.id + '-controls]').fadeOut(function() {$(this).remove()});
  $('[id=' + this.id + '-fader]').fadeOut(function() {$(this).remove()});
};

Dialog.remove = function(id) {
  $('[id=' + id + '-dialog]').fadeOut(function() {$(this).remove()});
  $('[id=' + id + '-controls]').fadeOut(function() {$(this).remove()});
  $('[id=' + id + '-fader]').fadeOut(function() {$(this).remove()});
};
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 * Get, cache and send feedback when connected.
 */
function Feedback() {}

Feedback.FEEDBACK_PREFIX = 'pending_feedback_';
Feedback.MAX_FEEDBACKS = 9;
Feedback.BUSY = false;

/**
 * Save feedback into the datastore.
 *
 * The datastore doesn't permit duplicates, so we use the FEEDBACK_PREFIX
 * followed by a number to store feedback. At most we allow 10 pending
 * feedbacks.
 *
 * @param deviceLat The latitude of the device, could be null.
 * @param deviceLng The longitude of the device, could be null.
 * @param code The currently displayed code, could be null.
 * @param address The currently displayed short code and address. Could be null.
 * @param compassFunction true if the compass looks ok, false otherwise.
 * @param lang The current language setting.
 * @param comment The comment from the user, truncated to 1024 chars.
 */
Feedback.storeFeedback = function(deviceLat, deviceLng, code, address, mapFunction, compassFunction, lang, comment) {
  // Do we have the maximum pending feedbacks?
  if (DataStore.has(Feedback.FEEDBACK_PREFIX + Feedback.MAX_FEEDBACKS)) {
    return;
  }
  // Feedback format is a string concat of all the information.
  // We have to do this so we can store it in the data store or as a cookie
  // until we can send it.
  var feedback = '';
  feedback += deviceLat + ':' + deviceLng + ':';
  feedback += mapFunction + ':';
  feedback += compassFunction + ':';
  feedback += lang + ':';
  feedback += $(window).height() + ':' + $(window).width() + ':';
  feedback += code + ':';
  feedback += encodeURIComponent(address) + ':';
  feedback += encodeURIComponent(comment.substr(0, 1024)) + ':';
  for (var i = 0; i <= Feedback.MAX_FEEDBACKS; i++) {
    if (!DataStore.has(Feedback.FEEDBACK_PREFIX + i)) {
      DataStore.putString(Feedback.FEEDBACK_PREFIX + i, feedback);
      break;
    }
  }
  Feedback.sendFeedback();
};

/** Try to send a feedback item. If successful remove it from the datastore. */
Feedback.sendFeedback = function() {
  if (Feedback.FEEDBACK_BUSY) {
    return;
  }
  var hasPendingFeedback = false;
  for (var i = Feedback.MAX_FEEDBACKS; i >= 0; i--) {
    if (DataStore.has(Feedback.FEEDBACK_PREFIX + i)) {
      hasPendingFeedback = true;
      Feedback.FEEDBACK_BUSY = true;
      var fields = DataStore.get(Feedback.FEEDBACK_PREFIX + i).split(':');
      // Try to send it asynchronously with jquery AJAX.
      var request = $.ajax({
        url: 'http://feedback.plus.codes/feedback.php',
        type: 'POST',
        data: {
                lat: fields[0],
                lng: fields[1],
                map: fields[2],
                compass: fields[3],
                lang: fields[4],
                height: fields[5],
                width: fields[6],
                code: fields[7],
                address: decodeURIComponent(fields[8]),
                comment: decodeURIComponent(fields[9]),
                ua: navigator.userAgent},
        dataType: 'text',
        statusCode: {
          404: function() {
            DataStore.clear(Feedback.FEEDBACK_PREFIX + i);
          }
        }
      });

      request.done(function(msg) {
        Feedback.FEEDBACK_BUSY = false;
        DataStore.clear(Feedback.FEEDBACK_PREFIX + i);
      });

      request.fail(function(jqXHR, textStatus) {
        Feedback.FEEDBACK_BUSY = false;
      });
      break;
    }
  }
  if (hasPendingFeedback) {
    setTimeout(Feedback.sendFeedback, 10000);
  }
}
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/** Provide functions to interact with a geocoder API. */
function Geocoder() {
}

/**
  Get a location for an address. Uses jQuery Deferred. The done()
  method will be called with the address, latitude and longitude. If a
  location cannot be determined, the reject() method is called with an error
  message.
  @param {string} address The address to geocode.
  @param {number} fallbackLat If the address is empty, the latitude to return
      instead.
  @param {number} fallbackLng If the address is empty, the longitude to return
      instead.
  @return {*} jQuery Promise object.
 */
Geocoder.geocodeAddress = function(address, fallbackLat, fallbackLng) {
  var deferred = $.Deferred();
  if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
    deferred.reject(messages.get('geocode-not-loaded', {ADDRESS: address}));
  } else if (address === '') {
    deferred.resolve(address, fallbackLat, fallbackLng);
  } else {
    // Google Maps API geocoder object.
    var geocoder = new google.maps.Geocoder();
    // Send the address off to the geocoder.
    geocoder.geocode(
        {'address': address, 'language': messages.language},
        function(results, status) {
          if (status != google.maps.GeocoderStatus.OK) {
            deferred.reject(
                messages.get('geocode-fail', {ADDRESS: address}));
          } else if (results === null || results.length == 0) {
            deferred.reject(messages.get('geocoder-no-info'));
          } else {
            var addressLocation = results[0].geometry.location;
            deferred.resolve(
                address, addressLocation.lat(), addressLocation.lng());
          }
        });
  }
  return deferred.promise();
};


/**
  Get a possible address for a location. Uses jQuery Deferred. The done()
  method will be called with the latitude, longitude and address. If an
  address cannot be determined, the reject() method is called with an error
  message.
  @param {number} lat The latitude.
  @param {number} lng The longitude
  @return {*} jQuery Promise object.
 */
Geocoder.lookupLatLng = function(lat, lng) {
  var deferred = $.Deferred();
  if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
    deferred.reject('');
    return deferred.promise();
  }
  // Google Maps API geocoder object.
  var geocoder = new google.maps.Geocoder();
  // Reverse geocode the lat/lng, rounding the coordinates or
  // sometimes the reverse lookups fail.
  var latlng = new google.maps.LatLng(
      Math.round(lat * 1E10) / 1E10,
      Math.round(lng * 1E10) / 1E10);
  geocoder.geocode(
      {'latLng': latlng, 'language': messages.language},
      function(results, status) {
        if (status != google.maps.GeocoderStatus.OK) {
          deferred.reject(messages.get('geocode-reverse-fail'));
          return deferred.promise();
        }
        if (results === null || results.length == 0) {
          deferred.reject(messages.get('geocoder-no-info'));
          return deferred.promise();
        }
        // We want to get a collection of components in order.
        // Including postcode can make shortening dependent on it.
        var types = [
            'neighborhood',
            'postal_town',
            'sublocality',
            'locality',
            'administrative_area_level_4',
            'administrative_area_level_3',
            'administrative_area_level_2',
            'administrative_area_level_1'];
        var address = Geocoder.__extractAddress(lat, lng, types, results);
        if (address === '') {
          deferred.reject(messages.get('geocoder-no-info'));
        } else {
          // Pass the location and address back.
          deferred.resolve(lat, lng, address);
        }
      });
  return deferred.promise();
};


/**
  Extract address components from a list of results to try to get the best
  address we can.
  @param {number} lat The latitude we geocoded.
  @param {number} lng The longitude we geocoded.
  @param {Array<string>} componentTypes A list of the component types we want,
      in order from most to least detailed.
  @param {object} results The results of a Google Maps API call to geocode a
      lat/lng.
  @return {string} an address string made up of the two most detailed componets,
      and the two least detailed components.
*/
Geocoder.__extractAddress = function(lat, lng, componentTypes, results) {
  // Mapping from type to name - so we know what components we have.
  var components = {};
  // Just a list of the acquired names - so we can avoid duplicates.
  var componentNames = [];
  // Scan all the results and all the address components for matches
  // with the desired types. Take the first match for any component and
  // save them in the addressXXX lists.
  for (var i = 0; i < results.length; i++) {
    // If the result is too far away, skip it, since it won't help shorten
    // the code anyway.
    if (Math.abs(lat - results[i].geometry.location.lat()) > 0.5 ||
        Math.abs(lng - results[i].geometry.location.lng()) > 0.5) {
      continue;
    }
    // Scan each of the components for this result.
    for (var j = 0; j < results[i].address_components.length; j++) {
      var addressComponent = results[i].address_components[j];
      // A component can have multiple types, so we need to check if this
      // includes one of the types we're interested in.
      for (var k = 0; k < addressComponent.types.length; k++) {
        // If we're interested in it, we don't already have that component,
        // we don't already have a component with the same name and it
        // doesn't include a comma, keep it.
        if (componentTypes.indexOf(addressComponent.types[k]) > -1 &&
            !(addressComponent.types[k] in components) &&
            componentNames.indexOf(addressComponent.long_name) == -1 &&
            addressComponent.long_name.indexOf(',') == -1) {
          componentNames.push(addressComponent.long_name);
          components[addressComponent.types[k]] = addressComponent.long_name;
        }
      }
    }
  }
  // Get up to two address components, starting at the most detailed level.
  var address = [];
  while (componentTypes.length > 0 && address.length < 2) {
    var type = componentTypes.shift();
    if (type in components) {
      address.push(components[type]);
    }
  }
  // Get up to two address components, starting at the least detailed level.
  var count = 0;
  while (componentTypes.length > 0 && count < 2) {
    var type = componentTypes.pop();
    if (type in components) {
      address.push(components[type]);
      count++;
    }
  }
  return address.join(', ');
};

/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
  Class to display the help pages. We expand a div up from the bottom, and
  then fade the content in and out. Tapping on the screen advances the help
  page, and there's a "got it" link at the bottom to dismiss.
 */
function Help() {
}
Help.numPages = 3;
Help.currentPage = 1;
Help.dialog = null;

Help.start = function() {
  Help.currentPage = 1;
  Help.dialog = new Dialog('help', $('<section>').html(Help.getPageContent()));
  Help.dialog.addButton($('<button>').addClass('previous').click(Help.clicked));
  Help.dialog.addButton($('<button>').addClass('dismiss').click(Help.clicked));
  Help.dialog.addButton($('<button>').addClass('next').click(Help.clicked));
  // Hide the previous button.
  $('#help-controls').find('.previous').off('click');
  $('#help-controls').find('.previous').addClass('hide');
};

Help.clicked = function(e) {
  if ($(this).hasClass('previous') && Help.currentPage > 1) {
    Help.currentPage -= 1;
  } else if ($(this).hasClass('next') && Help.currentPage < Help.numPages) {
    Help.currentPage += 1;
  } else if ($(this).hasClass('dismiss')) {
    Dialog.remove('help');
    return;
  }
  Help.adjustVisibility();
  $('#help-dialog').fadeOut(function() {
      $(this).html(Help.getPageContent());
      $(this).fadeIn();
  });
};

Help.adjustVisibility = function() {
  // Default to display all the buttons.
  $('#help-controls button').off('click');
  $('#help-controls button').click(Help.clicked);
  $('#help-controls button').removeClass('hide');
  if (Help.currentPage == 1) {
    // Hide the previous button on the first help page.
    $('#help-controls .previous').off('click');
    $('#help-controls .previous').addClass('hide');
  } else if (Help.currentPage == Help.numPages) {
    // Hide the next button on the last help page.
    $('#help-controls .next').off('click');
    $('#help-controls .next').addClass('hide');
  }
};

Help.getPageContent = function() {
  var content = "";
  for (var i = 0; i <= 9; i++) {
    var section = messages.get('help-0' + Help.currentPage + '-' + i);
    if (section === null) {
      break;
    }
    content += section;
  }
  return content;
};
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
  Class to handle the information panel at the bottom of the screen.
  @this InfoPanel
 */
function InfoBox() {
}

InfoBox.clear = function() {
  $('.infobox-panels').empty().append($('<div>').addClass('panel'));
};

InfoBox.setPanel = function(html) {
  $('.infobox-panels .panel').html(html);
};

/** Add content for another panel after existing panels. */
InfoBox.fadeToPanel = function(html) {
  // Fade out the existing panel and remove it.
  $('.infobox-panels .panel').fadeOut(function() {$(this).remove()});
  // Create the panel.
  var panel = $('<div>').addClass('panel').html(html)
      .click(InfoBox.nextPanel).css('display', 'none');
  $('.infobox-panels').append(panel);
  $('.infobox-panels .panel:last').fadeIn();
};
/*! jQuery v1.11.1 | (c) 2005, 2014 jQuery Foundation, Inc. | jquery.org/license */
!function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof window?window:this,function(a,b){var c=[],d=c.slice,e=c.concat,f=c.push,g=c.indexOf,h={},i=h.toString,j=h.hasOwnProperty,k={},l="1.11.1",m=function(a,b){return new m.fn.init(a,b)},n=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,o=/^-ms-/,p=/-([\da-z])/gi,q=function(a,b){return b.toUpperCase()};m.fn=m.prototype={jquery:l,constructor:m,selector:"",length:0,toArray:function(){return d.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:d.call(this)},pushStack:function(a){var b=m.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a,b){return m.each(this,a,b)},map:function(a){return this.pushStack(m.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(d.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor(null)},push:f,sort:c.sort,splice:c.splice},m.extend=m.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||m.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(e=arguments[h]))for(d in e)a=g[d],c=e[d],g!==c&&(j&&c&&(m.isPlainObject(c)||(b=m.isArray(c)))?(b?(b=!1,f=a&&m.isArray(a)?a:[]):f=a&&m.isPlainObject(a)?a:{},g[d]=m.extend(j,f,c)):void 0!==c&&(g[d]=c));return g},m.extend({expando:"jQuery"+(l+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===m.type(a)},isArray:Array.isArray||function(a){return"array"===m.type(a)},isWindow:function(a){return null!=a&&a==a.window},isNumeric:function(a){return!m.isArray(a)&&a-parseFloat(a)>=0},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},isPlainObject:function(a){var b;if(!a||"object"!==m.type(a)||a.nodeType||m.isWindow(a))return!1;try{if(a.constructor&&!j.call(a,"constructor")&&!j.call(a.constructor.prototype,"isPrototypeOf"))return!1}catch(c){return!1}if(k.ownLast)for(b in a)return j.call(a,b);for(b in a);return void 0===b||j.call(a,b)},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?h[i.call(a)]||"object":typeof a},globalEval:function(b){b&&m.trim(b)&&(a.execScript||function(b){a.eval.call(a,b)})(b)},camelCase:function(a){return a.replace(o,"ms-").replace(p,q)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b,c){var d,e=0,f=a.length,g=r(a);if(c){if(g){for(;f>e;e++)if(d=b.apply(a[e],c),d===!1)break}else for(e in a)if(d=b.apply(a[e],c),d===!1)break}else if(g){for(;f>e;e++)if(d=b.call(a[e],e,a[e]),d===!1)break}else for(e in a)if(d=b.call(a[e],e,a[e]),d===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(n,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(r(Object(a))?m.merge(c,"string"==typeof a?[a]:a):f.call(c,a)),c},inArray:function(a,b,c){var d;if(b){if(g)return g.call(b,a,c);for(d=b.length,c=c?0>c?Math.max(0,d+c):c:0;d>c;c++)if(c in b&&b[c]===a)return c}return-1},merge:function(a,b){var c=+b.length,d=0,e=a.length;while(c>d)a[e++]=b[d++];if(c!==c)while(void 0!==b[d])a[e++]=b[d++];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,f=0,g=a.length,h=r(a),i=[];if(h)for(;g>f;f++)d=b(a[f],f,c),null!=d&&i.push(d);else for(f in a)d=b(a[f],f,c),null!=d&&i.push(d);return e.apply([],i)},guid:1,proxy:function(a,b){var c,e,f;return"string"==typeof b&&(f=a[b],b=a,a=f),m.isFunction(a)?(c=d.call(arguments,2),e=function(){return a.apply(b||this,c.concat(d.call(arguments)))},e.guid=a.guid=a.guid||m.guid++,e):void 0},now:function(){return+new Date},support:k}),m.each("Boolean Number String Function Array Date RegExp Object Error".split(" "),function(a,b){h["[object "+b+"]"]=b.toLowerCase()});function r(a){var b=a.length,c=m.type(a);return"function"===c||m.isWindow(a)?!1:1===a.nodeType&&b?!0:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var s=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+-new Date,v=a.document,w=0,x=0,y=gb(),z=gb(),A=gb(),B=function(a,b){return a===b&&(l=!0),0},C="undefined",D=1<<31,E={}.hasOwnProperty,F=[],G=F.pop,H=F.push,I=F.push,J=F.slice,K=F.indexOf||function(a){for(var b=0,c=this.length;c>b;b++)if(this[b]===a)return b;return-1},L="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",M="[\\x20\\t\\r\\n\\f]",N="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",O=N.replace("w","w#"),P="\\["+M+"*("+N+")(?:"+M+"*([*^$|!~]?=)"+M+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+O+"))|)"+M+"*\\]",Q=":("+N+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+P+")*)|.*)\\)|)",R=new RegExp("^"+M+"+|((?:^|[^\\\\])(?:\\\\.)*)"+M+"+$","g"),S=new RegExp("^"+M+"*,"+M+"*"),T=new RegExp("^"+M+"*([>+~]|"+M+")"+M+"*"),U=new RegExp("="+M+"*([^\\]'\"]*?)"+M+"*\\]","g"),V=new RegExp(Q),W=new RegExp("^"+O+"$"),X={ID:new RegExp("^#("+N+")"),CLASS:new RegExp("^\\.("+N+")"),TAG:new RegExp("^("+N.replace("w","w*")+")"),ATTR:new RegExp("^"+P),PSEUDO:new RegExp("^"+Q),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+M+"*(even|odd|(([+-]|)(\\d*)n|)"+M+"*(?:([+-]|)"+M+"*(\\d+)|))"+M+"*\\)|)","i"),bool:new RegExp("^(?:"+L+")$","i"),needsContext:new RegExp("^"+M+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+M+"*((?:-\\d)?\\d*)"+M+"*\\)|)(?=[^-]|$)","i")},Y=/^(?:input|select|textarea|button)$/i,Z=/^h\d$/i,$=/^[^{]+\{\s*\[native \w/,_=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,ab=/[+~]/,bb=/'|\\/g,cb=new RegExp("\\\\([\\da-f]{1,6}"+M+"?|("+M+")|.)","ig"),db=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)};try{I.apply(F=J.call(v.childNodes),v.childNodes),F[v.childNodes.length].nodeType}catch(eb){I={apply:F.length?function(a,b){H.apply(a,J.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function fb(a,b,d,e){var f,h,j,k,l,o,r,s,w,x;if((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,d=d||[],!a||"string"!=typeof a)return d;if(1!==(k=b.nodeType)&&9!==k)return[];if(p&&!e){if(f=_.exec(a))if(j=f[1]){if(9===k){if(h=b.getElementById(j),!h||!h.parentNode)return d;if(h.id===j)return d.push(h),d}else if(b.ownerDocument&&(h=b.ownerDocument.getElementById(j))&&t(b,h)&&h.id===j)return d.push(h),d}else{if(f[2])return I.apply(d,b.getElementsByTagName(a)),d;if((j=f[3])&&c.getElementsByClassName&&b.getElementsByClassName)return I.apply(d,b.getElementsByClassName(j)),d}if(c.qsa&&(!q||!q.test(a))){if(s=r=u,w=b,x=9===k&&a,1===k&&"object"!==b.nodeName.toLowerCase()){o=g(a),(r=b.getAttribute("id"))?s=r.replace(bb,"\\$&"):b.setAttribute("id",s),s="[id='"+s+"'] ",l=o.length;while(l--)o[l]=s+qb(o[l]);w=ab.test(a)&&ob(b.parentNode)||b,x=o.join(",")}if(x)try{return I.apply(d,w.querySelectorAll(x)),d}catch(y){}finally{r||b.removeAttribute("id")}}}return i(a.replace(R,"$1"),b,d,e)}function gb(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function hb(a){return a[u]=!0,a}function ib(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function jb(a,b){var c=a.split("|"),e=a.length;while(e--)d.attrHandle[c[e]]=b}function kb(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||D)-(~a.sourceIndex||D);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function lb(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function mb(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function nb(a){return hb(function(b){return b=+b,hb(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function ob(a){return a&&typeof a.getElementsByTagName!==C&&a}c=fb.support={},f=fb.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=fb.setDocument=function(a){var b,e=a?a.ownerDocument||a:v,g=e.defaultView;return e!==n&&9===e.nodeType&&e.documentElement?(n=e,o=e.documentElement,p=!f(e),g&&g!==g.top&&(g.addEventListener?g.addEventListener("unload",function(){m()},!1):g.attachEvent&&g.attachEvent("onunload",function(){m()})),c.attributes=ib(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ib(function(a){return a.appendChild(e.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=$.test(e.getElementsByClassName)&&ib(function(a){return a.innerHTML="<div class='a'></div><div class='a i'></div>",a.firstChild.className="i",2===a.getElementsByClassName("i").length}),c.getById=ib(function(a){return o.appendChild(a).id=u,!e.getElementsByName||!e.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if(typeof b.getElementById!==C&&p){var c=b.getElementById(a);return c&&c.parentNode?[c]:[]}},d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(cb,db);return function(a){var c=typeof a.getAttributeNode!==C&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return typeof b.getElementsByTagName!==C?b.getElementsByTagName(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return typeof b.getElementsByClassName!==C&&p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=$.test(e.querySelectorAll))&&(ib(function(a){a.innerHTML="<select msallowclip=''><option selected=''></option></select>",a.querySelectorAll("[msallowclip^='']").length&&q.push("[*^$]="+M+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+M+"*(?:value|"+L+")"),a.querySelectorAll(":checked").length||q.push(":checked")}),ib(function(a){var b=e.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+M+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=$.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ib(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",Q)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=$.test(o.compareDocumentPosition),t=b||$.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===e||a.ownerDocument===v&&t(v,a)?-1:b===e||b.ownerDocument===v&&t(v,b)?1:k?K.call(k,a)-K.call(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,f=a.parentNode,g=b.parentNode,h=[a],i=[b];if(!f||!g)return a===e?-1:b===e?1:f?-1:g?1:k?K.call(k,a)-K.call(k,b):0;if(f===g)return kb(a,b);c=a;while(c=c.parentNode)h.unshift(c);c=b;while(c=c.parentNode)i.unshift(c);while(h[d]===i[d])d++;return d?kb(h[d],i[d]):h[d]===v?-1:i[d]===v?1:0},e):n},fb.matches=function(a,b){return fb(a,null,null,b)},fb.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(U,"='$1']"),!(!c.matchesSelector||!p||r&&r.test(b)||q&&q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return fb(b,n,null,[a]).length>0},fb.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},fb.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&E.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},fb.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},fb.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=fb.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=fb.selectors={cacheLength:50,createPseudo:hb,match:X,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(cb,db),a[3]=(a[3]||a[4]||a[5]||"").replace(cb,db),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||fb.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&fb.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return X.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&V.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(cb,db).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+M+")"+a+"("+M+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||typeof a.getAttribute!==C&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=fb.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h;if(q){if(f){while(p){l=b;while(l=l[p])if(h?l.nodeName.toLowerCase()===r:1===l.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){k=q[u]||(q[u]={}),j=k[a]||[],n=j[0]===w&&j[1],m=j[0]===w&&j[2],l=n&&q.childNodes[n];while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if(1===l.nodeType&&++m&&l===b){k[a]=[w,n,m];break}}else if(s&&(j=(b[u]||(b[u]={}))[a])&&j[0]===w)m=j[1];else while(l=++n&&l&&l[p]||(m=n=0)||o.pop())if((h?l.nodeName.toLowerCase()===r:1===l.nodeType)&&++m&&(s&&((l[u]||(l[u]={}))[a]=[w,m]),l===b))break;return m-=e,m===d||m%d===0&&m/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||fb.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?hb(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=K.call(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:hb(function(a){var b=[],c=[],d=h(a.replace(R,"$1"));return d[u]?hb(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),!c.pop()}}),has:hb(function(a){return function(b){return fb(a,b).length>0}}),contains:hb(function(a){return function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:hb(function(a){return W.test(a||"")||fb.error("unsupported lang: "+a),a=a.replace(cb,db).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Z.test(a.nodeName)},input:function(a){return Y.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:nb(function(){return[0]}),last:nb(function(a,b){return[b-1]}),eq:nb(function(a,b,c){return[0>c?c+b:c]}),even:nb(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:nb(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:nb(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:nb(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=lb(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=mb(b);function pb(){}pb.prototype=d.filters=d.pseudos,d.setFilters=new pb,g=fb.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){(!c||(e=S.exec(h)))&&(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=T.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(R," ")}),h=h.slice(c.length));for(g in d.filter)!(e=X[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?fb.error(a):z(a,i).slice(0)};function qb(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function rb(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(i=b[u]||(b[u]={}),(h=i[d])&&h[0]===w&&h[1]===f)return j[2]=h[2];if(i[d]=j,j[2]=a(b,c,g))return!0}}}function sb(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function tb(a,b,c){for(var d=0,e=b.length;e>d;d++)fb(a,b[d],c);return c}function ub(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(!c||c(f,d,e))&&(g.push(f),j&&b.push(h));return g}function vb(a,b,c,d,e,f){return d&&!d[u]&&(d=vb(d)),e&&!e[u]&&(e=vb(e,f)),hb(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||tb(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:ub(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=ub(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?K.call(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=ub(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):I.apply(g,r)})}function wb(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=rb(function(a){return a===b},h,!0),l=rb(function(a){return K.call(b,a)>-1},h,!0),m=[function(a,c,d){return!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d))}];f>i;i++)if(c=d.relative[a[i].type])m=[rb(sb(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return vb(i>1&&sb(m),i>1&&qb(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(R,"$1"),c,e>i&&wb(a.slice(i,e)),f>e&&wb(a=a.slice(e)),f>e&&qb(a))}m.push(c)}return sb(m)}function xb(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,m,o,p=0,q="0",r=f&&[],s=[],t=j,u=f||e&&d.find.TAG("*",k),v=w+=null==t?1:Math.random()||.1,x=u.length;for(k&&(j=g!==n&&g);q!==x&&null!=(l=u[q]);q++){if(e&&l){m=0;while(o=a[m++])if(o(l,g,h)){i.push(l);break}k&&(w=v)}c&&((l=!o&&l)&&p--,f&&r.push(l))}if(p+=q,c&&q!==p){m=0;while(o=b[m++])o(r,s,g,h);if(f){if(p>0)while(q--)r[q]||s[q]||(s[q]=G.call(i));s=ub(s)}I.apply(i,s),k&&!f&&s.length>0&&p+b.length>1&&fb.uniqueSort(i)}return k&&(w=v,j=t),r};return c?hb(f):f}return h=fb.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=wb(b[c]),f[u]?d.push(f):e.push(f);f=A(a,xb(e,d)),f.selector=a}return f},i=fb.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(cb,db),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=X.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(cb,db),ab.test(j[0].type)&&ob(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&qb(j),!a)return I.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,ab.test(a)&&ob(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ib(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),ib(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||jb("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ib(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||jb("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),ib(function(a){return null==a.getAttribute("disabled")})||jb(L,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),fb}(a);m.find=s,m.expr=s.selectors,m.expr[":"]=m.expr.pseudos,m.unique=s.uniqueSort,m.text=s.getText,m.isXMLDoc=s.isXML,m.contains=s.contains;var t=m.expr.match.needsContext,u=/^<(\w+)\s*\/?>(?:<\/\1>|)$/,v=/^.[^:#\[\.,]*$/;function w(a,b,c){if(m.isFunction(b))return m.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return m.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(v.test(b))return m.filter(b,a,c);b=m.filter(b,a)}return m.grep(a,function(a){return m.inArray(a,b)>=0!==c})}m.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?m.find.matchesSelector(d,a)?[d]:[]:m.find.matches(a,m.grep(b,function(a){return 1===a.nodeType}))},m.fn.extend({find:function(a){var b,c=[],d=this,e=d.length;if("string"!=typeof a)return this.pushStack(m(a).filter(function(){for(b=0;e>b;b++)if(m.contains(d[b],this))return!0}));for(b=0;e>b;b++)m.find(a,d[b],c);return c=this.pushStack(e>1?m.unique(c):c),c.selector=this.selector?this.selector+" "+a:a,c},filter:function(a){return this.pushStack(w(this,a||[],!1))},not:function(a){return this.pushStack(w(this,a||[],!0))},is:function(a){return!!w(this,"string"==typeof a&&t.test(a)?m(a):a||[],!1).length}});var x,y=a.document,z=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,A=m.fn.init=function(a,b){var c,d;if(!a)return this;if("string"==typeof a){if(c="<"===a.charAt(0)&&">"===a.charAt(a.length-1)&&a.length>=3?[null,a,null]:z.exec(a),!c||!c[1]&&b)return!b||b.jquery?(b||x).find(a):this.constructor(b).find(a);if(c[1]){if(b=b instanceof m?b[0]:b,m.merge(this,m.parseHTML(c[1],b&&b.nodeType?b.ownerDocument||b:y,!0)),u.test(c[1])&&m.isPlainObject(b))for(c in b)m.isFunction(this[c])?this[c](b[c]):this.attr(c,b[c]);return this}if(d=y.getElementById(c[2]),d&&d.parentNode){if(d.id!==c[2])return x.find(a);this.length=1,this[0]=d}return this.context=y,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):m.isFunction(a)?"undefined"!=typeof x.ready?x.ready(a):a(m):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),m.makeArray(a,this))};A.prototype=m.fn,x=m(y);var B=/^(?:parents|prev(?:Until|All))/,C={children:!0,contents:!0,next:!0,prev:!0};m.extend({dir:function(a,b,c){var d=[],e=a[b];while(e&&9!==e.nodeType&&(void 0===c||1!==e.nodeType||!m(e).is(c)))1===e.nodeType&&d.push(e),e=e[b];return d},sibling:function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c}}),m.fn.extend({has:function(a){var b,c=m(a,this),d=c.length;return this.filter(function(){for(b=0;d>b;b++)if(m.contains(this,c[b]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=t.test(a)||"string"!=typeof a?m(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&m.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?m.unique(f):f)},index:function(a){return a?"string"==typeof a?m.inArray(this[0],m(a)):m.inArray(a.jquery?a[0]:a,this):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(m.unique(m.merge(this.get(),m(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function D(a,b){do a=a[b];while(a&&1!==a.nodeType);return a}m.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return m.dir(a,"parentNode")},parentsUntil:function(a,b,c){return m.dir(a,"parentNode",c)},next:function(a){return D(a,"nextSibling")},prev:function(a){return D(a,"previousSibling")},nextAll:function(a){return m.dir(a,"nextSibling")},prevAll:function(a){return m.dir(a,"previousSibling")},nextUntil:function(a,b,c){return m.dir(a,"nextSibling",c)},prevUntil:function(a,b,c){return m.dir(a,"previousSibling",c)},siblings:function(a){return m.sibling((a.parentNode||{}).firstChild,a)},children:function(a){return m.sibling(a.firstChild)},contents:function(a){return m.nodeName(a,"iframe")?a.contentDocument||a.contentWindow.document:m.merge([],a.childNodes)}},function(a,b){m.fn[a]=function(c,d){var e=m.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=m.filter(d,e)),this.length>1&&(C[a]||(e=m.unique(e)),B.test(a)&&(e=e.reverse())),this.pushStack(e)}});var E=/\S+/g,F={};function G(a){var b=F[a]={};return m.each(a.match(E)||[],function(a,c){b[c]=!0}),b}m.Callbacks=function(a){a="string"==typeof a?F[a]||G(a):m.extend({},a);var b,c,d,e,f,g,h=[],i=!a.once&&[],j=function(l){for(c=a.memory&&l,d=!0,f=g||0,g=0,e=h.length,b=!0;h&&e>f;f++)if(h[f].apply(l[0],l[1])===!1&&a.stopOnFalse){c=!1;break}b=!1,h&&(i?i.length&&j(i.shift()):c?h=[]:k.disable())},k={add:function(){if(h){var d=h.length;!function f(b){m.each(b,function(b,c){var d=m.type(c);"function"===d?a.unique&&k.has(c)||h.push(c):c&&c.length&&"string"!==d&&f(c)})}(arguments),b?e=h.length:c&&(g=d,j(c))}return this},remove:function(){return h&&m.each(arguments,function(a,c){var d;while((d=m.inArray(c,h,d))>-1)h.splice(d,1),b&&(e>=d&&e--,f>=d&&f--)}),this},has:function(a){return a?m.inArray(a,h)>-1:!(!h||!h.length)},empty:function(){return h=[],e=0,this},disable:function(){return h=i=c=void 0,this},disabled:function(){return!h},lock:function(){return i=void 0,c||k.disable(),this},locked:function(){return!i},fireWith:function(a,c){return!h||d&&!i||(c=c||[],c=[a,c.slice?c.slice():c],b?i.push(c):j(c)),this},fire:function(){return k.fireWith(this,arguments),this},fired:function(){return!!d}};return k},m.extend({Deferred:function(a){var b=[["resolve","done",m.Callbacks("once memory"),"resolved"],["reject","fail",m.Callbacks("once memory"),"rejected"],["notify","progress",m.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return m.Deferred(function(c){m.each(b,function(b,f){var g=m.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&m.isFunction(a.promise)?a.promise().done(c.resolve).fail(c.reject).progress(c.notify):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?m.extend(a,d):d}},e={};return d.pipe=d.then,m.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=d.call(arguments),e=c.length,f=1!==e||a&&m.isFunction(a.promise)?e:0,g=1===f?a:m.Deferred(),h=function(a,b,c){return function(e){b[a]=this,c[a]=arguments.length>1?d.call(arguments):e,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(e>1)for(i=new Array(e),j=new Array(e),k=new Array(e);e>b;b++)c[b]&&m.isFunction(c[b].promise)?c[b].promise().done(h(b,k,c)).fail(g.reject).progress(h(b,j,i)):--f;return f||g.resolveWith(k,c),g.promise()}});var H;m.fn.ready=function(a){return m.ready.promise().done(a),this},m.extend({isReady:!1,readyWait:1,holdReady:function(a){a?m.readyWait++:m.ready(!0)},ready:function(a){if(a===!0?!--m.readyWait:!m.isReady){if(!y.body)return setTimeout(m.ready);m.isReady=!0,a!==!0&&--m.readyWait>0||(H.resolveWith(y,[m]),m.fn.triggerHandler&&(m(y).triggerHandler("ready"),m(y).off("ready")))}}});function I(){y.addEventListener?(y.removeEventListener("DOMContentLoaded",J,!1),a.removeEventListener("load",J,!1)):(y.detachEvent("onreadystatechange",J),a.detachEvent("onload",J))}function J(){(y.addEventListener||"load"===event.type||"complete"===y.readyState)&&(I(),m.ready())}m.ready.promise=function(b){if(!H)if(H=m.Deferred(),"complete"===y.readyState)setTimeout(m.ready);else if(y.addEventListener)y.addEventListener("DOMContentLoaded",J,!1),a.addEventListener("load",J,!1);else{y.attachEvent("onreadystatechange",J),a.attachEvent("onload",J);var c=!1;try{c=null==a.frameElement&&y.documentElement}catch(d){}c&&c.doScroll&&!function e(){if(!m.isReady){try{c.doScroll("left")}catch(a){return setTimeout(e,50)}I(),m.ready()}}()}return H.promise(b)};var K="undefined",L;for(L in m(k))break;k.ownLast="0"!==L,k.inlineBlockNeedsLayout=!1,m(function(){var a,b,c,d;c=y.getElementsByTagName("body")[0],c&&c.style&&(b=y.createElement("div"),d=y.createElement("div"),d.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(d).appendChild(b),typeof b.style.zoom!==K&&(b.style.cssText="display:inline;margin:0;border:0;padding:1px;width:1px;zoom:1",k.inlineBlockNeedsLayout=a=3===b.offsetWidth,a&&(c.style.zoom=1)),c.removeChild(d))}),function(){var a=y.createElement("div");if(null==k.deleteExpando){k.deleteExpando=!0;try{delete a.test}catch(b){k.deleteExpando=!1}}a=null}(),m.acceptData=function(a){var b=m.noData[(a.nodeName+" ").toLowerCase()],c=+a.nodeType||1;return 1!==c&&9!==c?!1:!b||b!==!0&&a.getAttribute("classid")===b};var M=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,N=/([A-Z])/g;function O(a,b,c){if(void 0===c&&1===a.nodeType){var d="data-"+b.replace(N,"-$1").toLowerCase();if(c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:M.test(c)?m.parseJSON(c):c}catch(e){}m.data(a,b,c)}else c=void 0}return c}function P(a){var b;for(b in a)if(("data"!==b||!m.isEmptyObject(a[b]))&&"toJSON"!==b)return!1;return!0}function Q(a,b,d,e){if(m.acceptData(a)){var f,g,h=m.expando,i=a.nodeType,j=i?m.cache:a,k=i?a[h]:a[h]&&h;
if(k&&j[k]&&(e||j[k].data)||void 0!==d||"string"!=typeof b)return k||(k=i?a[h]=c.pop()||m.guid++:h),j[k]||(j[k]=i?{}:{toJSON:m.noop}),("object"==typeof b||"function"==typeof b)&&(e?j[k]=m.extend(j[k],b):j[k].data=m.extend(j[k].data,b)),g=j[k],e||(g.data||(g.data={}),g=g.data),void 0!==d&&(g[m.camelCase(b)]=d),"string"==typeof b?(f=g[b],null==f&&(f=g[m.camelCase(b)])):f=g,f}}function R(a,b,c){if(m.acceptData(a)){var d,e,f=a.nodeType,g=f?m.cache:a,h=f?a[m.expando]:m.expando;if(g[h]){if(b&&(d=c?g[h]:g[h].data)){m.isArray(b)?b=b.concat(m.map(b,m.camelCase)):b in d?b=[b]:(b=m.camelCase(b),b=b in d?[b]:b.split(" ")),e=b.length;while(e--)delete d[b[e]];if(c?!P(d):!m.isEmptyObject(d))return}(c||(delete g[h].data,P(g[h])))&&(f?m.cleanData([a],!0):k.deleteExpando||g!=g.window?delete g[h]:g[h]=null)}}}m.extend({cache:{},noData:{"applet ":!0,"embed ":!0,"object ":"clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"},hasData:function(a){return a=a.nodeType?m.cache[a[m.expando]]:a[m.expando],!!a&&!P(a)},data:function(a,b,c){return Q(a,b,c)},removeData:function(a,b){return R(a,b)},_data:function(a,b,c){return Q(a,b,c,!0)},_removeData:function(a,b){return R(a,b,!0)}}),m.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=m.data(f),1===f.nodeType&&!m._data(f,"parsedAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=m.camelCase(d.slice(5)),O(f,d,e[d])));m._data(f,"parsedAttrs",!0)}return e}return"object"==typeof a?this.each(function(){m.data(this,a)}):arguments.length>1?this.each(function(){m.data(this,a,b)}):f?O(f,a,m.data(f,a)):void 0},removeData:function(a){return this.each(function(){m.removeData(this,a)})}}),m.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=m._data(a,b),c&&(!d||m.isArray(c)?d=m._data(a,b,m.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=m.queue(a,b),d=c.length,e=c.shift(),f=m._queueHooks(a,b),g=function(){m.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return m._data(a,c)||m._data(a,c,{empty:m.Callbacks("once memory").add(function(){m._removeData(a,b+"queue"),m._removeData(a,c)})})}}),m.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?m.queue(this[0],a):void 0===b?this:this.each(function(){var c=m.queue(this,a,b);m._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&m.dequeue(this,a)})},dequeue:function(a){return this.each(function(){m.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=m.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=m._data(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var S=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,T=["Top","Right","Bottom","Left"],U=function(a,b){return a=b||a,"none"===m.css(a,"display")||!m.contains(a.ownerDocument,a)},V=m.access=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===m.type(c)){e=!0;for(h in c)m.access(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,m.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(m(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f},W=/^(?:checkbox|radio)$/i;!function(){var a=y.createElement("input"),b=y.createElement("div"),c=y.createDocumentFragment();if(b.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",k.leadingWhitespace=3===b.firstChild.nodeType,k.tbody=!b.getElementsByTagName("tbody").length,k.htmlSerialize=!!b.getElementsByTagName("link").length,k.html5Clone="<:nav></:nav>"!==y.createElement("nav").cloneNode(!0).outerHTML,a.type="checkbox",a.checked=!0,c.appendChild(a),k.appendChecked=a.checked,b.innerHTML="<textarea>x</textarea>",k.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue,c.appendChild(b),b.innerHTML="<input type='radio' checked='checked' name='t'/>",k.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,k.noCloneEvent=!0,b.attachEvent&&(b.attachEvent("onclick",function(){k.noCloneEvent=!1}),b.cloneNode(!0).click()),null==k.deleteExpando){k.deleteExpando=!0;try{delete b.test}catch(d){k.deleteExpando=!1}}}(),function(){var b,c,d=y.createElement("div");for(b in{submit:!0,change:!0,focusin:!0})c="on"+b,(k[b+"Bubbles"]=c in a)||(d.setAttribute(c,"t"),k[b+"Bubbles"]=d.attributes[c].expando===!1);d=null}();var X=/^(?:input|select|textarea)$/i,Y=/^key/,Z=/^(?:mouse|pointer|contextmenu)|click/,$=/^(?:focusinfocus|focusoutblur)$/,_=/^([^.]*)(?:\.(.+)|)$/;function ab(){return!0}function bb(){return!1}function cb(){try{return y.activeElement}catch(a){}}m.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,n,o,p,q,r=m._data(a);if(r){c.handler&&(i=c,c=i.handler,e=i.selector),c.guid||(c.guid=m.guid++),(g=r.events)||(g=r.events={}),(k=r.handle)||(k=r.handle=function(a){return typeof m===K||a&&m.event.triggered===a.type?void 0:m.event.dispatch.apply(k.elem,arguments)},k.elem=a),b=(b||"").match(E)||[""],h=b.length;while(h--)f=_.exec(b[h])||[],o=q=f[1],p=(f[2]||"").split(".").sort(),o&&(j=m.event.special[o]||{},o=(e?j.delegateType:j.bindType)||o,j=m.event.special[o]||{},l=m.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&m.expr.match.needsContext.test(e),namespace:p.join(".")},i),(n=g[o])||(n=g[o]=[],n.delegateCount=0,j.setup&&j.setup.call(a,d,p,k)!==!1||(a.addEventListener?a.addEventListener(o,k,!1):a.attachEvent&&a.attachEvent("on"+o,k))),j.add&&(j.add.call(a,l),l.handler.guid||(l.handler.guid=c.guid)),e?n.splice(n.delegateCount++,0,l):n.push(l),m.event.global[o]=!0);a=null}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,n,o,p,q,r=m.hasData(a)&&m._data(a);if(r&&(k=r.events)){b=(b||"").match(E)||[""],j=b.length;while(j--)if(h=_.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=m.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,n=k[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),i=f=n.length;while(f--)g=n[f],!e&&q!==g.origType||c&&c.guid!==g.guid||h&&!h.test(g.namespace)||d&&d!==g.selector&&("**"!==d||!g.selector)||(n.splice(f,1),g.selector&&n.delegateCount--,l.remove&&l.remove.call(a,g));i&&!n.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||m.removeEvent(a,o,r.handle),delete k[o])}else for(o in k)m.event.remove(a,o+b[j],c,d,!0);m.isEmptyObject(k)&&(delete r.handle,m._removeData(a,"events"))}},trigger:function(b,c,d,e){var f,g,h,i,k,l,n,o=[d||y],p=j.call(b,"type")?b.type:b,q=j.call(b,"namespace")?b.namespace.split("."):[];if(h=l=d=d||y,3!==d.nodeType&&8!==d.nodeType&&!$.test(p+m.event.triggered)&&(p.indexOf(".")>=0&&(q=p.split("."),p=q.shift(),q.sort()),g=p.indexOf(":")<0&&"on"+p,b=b[m.expando]?b:new m.Event(p,"object"==typeof b&&b),b.isTrigger=e?2:3,b.namespace=q.join("."),b.namespace_re=b.namespace?new RegExp("(^|\\.)"+q.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=d),c=null==c?[b]:m.makeArray(c,[b]),k=m.event.special[p]||{},e||!k.trigger||k.trigger.apply(d,c)!==!1)){if(!e&&!k.noBubble&&!m.isWindow(d)){for(i=k.delegateType||p,$.test(i+p)||(h=h.parentNode);h;h=h.parentNode)o.push(h),l=h;l===(d.ownerDocument||y)&&o.push(l.defaultView||l.parentWindow||a)}n=0;while((h=o[n++])&&!b.isPropagationStopped())b.type=n>1?i:k.bindType||p,f=(m._data(h,"events")||{})[b.type]&&m._data(h,"handle"),f&&f.apply(h,c),f=g&&h[g],f&&f.apply&&m.acceptData(h)&&(b.result=f.apply(h,c),b.result===!1&&b.preventDefault());if(b.type=p,!e&&!b.isDefaultPrevented()&&(!k._default||k._default.apply(o.pop(),c)===!1)&&m.acceptData(d)&&g&&d[p]&&!m.isWindow(d)){l=d[g],l&&(d[g]=null),m.event.triggered=p;try{d[p]()}catch(r){}m.event.triggered=void 0,l&&(d[g]=l)}return b.result}},dispatch:function(a){a=m.event.fix(a);var b,c,e,f,g,h=[],i=d.call(arguments),j=(m._data(this,"events")||{})[a.type]||[],k=m.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=m.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,g=0;while((e=f.handlers[g++])&&!a.isImmediatePropagationStopped())(!a.namespace_re||a.namespace_re.test(e.namespace))&&(a.handleObj=e,a.data=e.data,c=((m.event.special[e.origType]||{}).handle||e.handler).apply(f.elem,i),void 0!==c&&(a.result=c)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&(!a.button||"click"!==a.type))for(;i!=this;i=i.parentNode||this)if(1===i.nodeType&&(i.disabled!==!0||"click"!==a.type)){for(e=[],f=0;h>f;f++)d=b[f],c=d.selector+" ",void 0===e[c]&&(e[c]=d.needsContext?m(c,this).index(i)>=0:m.find(c,this,null,[i]).length),e[c]&&e.push(d);e.length&&g.push({elem:i,handlers:e})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},fix:function(a){if(a[m.expando])return a;var b,c,d,e=a.type,f=a,g=this.fixHooks[e];g||(this.fixHooks[e]=g=Z.test(e)?this.mouseHooks:Y.test(e)?this.keyHooks:{}),d=g.props?this.props.concat(g.props):this.props,a=new m.Event(f),b=d.length;while(b--)c=d[b],a[c]=f[c];return a.target||(a.target=f.srcElement||y),3===a.target.nodeType&&(a.target=a.target.parentNode),a.metaKey=!!a.metaKey,g.filter?g.filter(a,f):a},props:"altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,d,e,f=b.button,g=b.fromElement;return null==a.pageX&&null!=b.clientX&&(d=a.target.ownerDocument||y,e=d.documentElement,c=d.body,a.pageX=b.clientX+(e&&e.scrollLeft||c&&c.scrollLeft||0)-(e&&e.clientLeft||c&&c.clientLeft||0),a.pageY=b.clientY+(e&&e.scrollTop||c&&c.scrollTop||0)-(e&&e.clientTop||c&&c.clientTop||0)),!a.relatedTarget&&g&&(a.relatedTarget=g===a.target?b.toElement:g),a.which||void 0===f||(a.which=1&f?1:2&f?3:4&f?2:0),a}},special:{load:{noBubble:!0},focus:{trigger:function(){if(this!==cb()&&this.focus)try{return this.focus(),!1}catch(a){}},delegateType:"focusin"},blur:{trigger:function(){return this===cb()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return m.nodeName(this,"input")&&"checkbox"===this.type&&this.click?(this.click(),!1):void 0},_default:function(a){return m.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}},simulate:function(a,b,c,d){var e=m.extend(new m.Event,c,{type:a,isSimulated:!0,originalEvent:{}});d?m.event.trigger(e,null,b):m.event.dispatch.call(b,e),e.isDefaultPrevented()&&c.preventDefault()}},m.removeEvent=y.removeEventListener?function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c,!1)}:function(a,b,c){var d="on"+b;a.detachEvent&&(typeof a[d]===K&&(a[d]=null),a.detachEvent(d,c))},m.Event=function(a,b){return this instanceof m.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?ab:bb):this.type=a,b&&m.extend(this,b),this.timeStamp=a&&a.timeStamp||m.now(),void(this[m.expando]=!0)):new m.Event(a,b)},m.Event.prototype={isDefaultPrevented:bb,isPropagationStopped:bb,isImmediatePropagationStopped:bb,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=ab,a&&(a.preventDefault?a.preventDefault():a.returnValue=!1)},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=ab,a&&(a.stopPropagation&&a.stopPropagation(),a.cancelBubble=!0)},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=ab,a&&a.stopImmediatePropagation&&a.stopImmediatePropagation(),this.stopPropagation()}},m.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){m.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return(!e||e!==d&&!m.contains(d,e))&&(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),k.submitBubbles||(m.event.special.submit={setup:function(){return m.nodeName(this,"form")?!1:void m.event.add(this,"click._submit keypress._submit",function(a){var b=a.target,c=m.nodeName(b,"input")||m.nodeName(b,"button")?b.form:void 0;c&&!m._data(c,"submitBubbles")&&(m.event.add(c,"submit._submit",function(a){a._submit_bubble=!0}),m._data(c,"submitBubbles",!0))})},postDispatch:function(a){a._submit_bubble&&(delete a._submit_bubble,this.parentNode&&!a.isTrigger&&m.event.simulate("submit",this.parentNode,a,!0))},teardown:function(){return m.nodeName(this,"form")?!1:void m.event.remove(this,"._submit")}}),k.changeBubbles||(m.event.special.change={setup:function(){return X.test(this.nodeName)?(("checkbox"===this.type||"radio"===this.type)&&(m.event.add(this,"propertychange._change",function(a){"checked"===a.originalEvent.propertyName&&(this._just_changed=!0)}),m.event.add(this,"click._change",function(a){this._just_changed&&!a.isTrigger&&(this._just_changed=!1),m.event.simulate("change",this,a,!0)})),!1):void m.event.add(this,"beforeactivate._change",function(a){var b=a.target;X.test(b.nodeName)&&!m._data(b,"changeBubbles")&&(m.event.add(b,"change._change",function(a){!this.parentNode||a.isSimulated||a.isTrigger||m.event.simulate("change",this.parentNode,a,!0)}),m._data(b,"changeBubbles",!0))})},handle:function(a){var b=a.target;return this!==b||a.isSimulated||a.isTrigger||"radio"!==b.type&&"checkbox"!==b.type?a.handleObj.handler.apply(this,arguments):void 0},teardown:function(){return m.event.remove(this,"._change"),!X.test(this.nodeName)}}),k.focusinBubbles||m.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){m.event.simulate(b,a.target,m.event.fix(a),!0)};m.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=m._data(d,b);e||d.addEventListener(a,c,!0),m._data(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=m._data(d,b)-1;e?m._data(d,b,e):(d.removeEventListener(a,c,!0),m._removeData(d,b))}}}),m.fn.extend({on:function(a,b,c,d,e){var f,g;if("object"==typeof a){"string"!=typeof b&&(c=c||b,b=void 0);for(f in a)this.on(f,b,c,a[f],e);return this}if(null==c&&null==d?(d=b,c=b=void 0):null==d&&("string"==typeof b?(d=c,c=void 0):(d=c,c=b,b=void 0)),d===!1)d=bb;else if(!d)return this;return 1===e&&(g=d,d=function(a){return m().off(a),g.apply(this,arguments)},d.guid=g.guid||(g.guid=m.guid++)),this.each(function(){m.event.add(this,a,d,c,b)})},one:function(a,b,c,d){return this.on(a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,m(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return(b===!1||"function"==typeof b)&&(c=b,b=void 0),c===!1&&(c=bb),this.each(function(){m.event.remove(this,a,c,b)})},trigger:function(a,b){return this.each(function(){m.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?m.event.trigger(a,b,c,!0):void 0}});function db(a){var b=eb.split("|"),c=a.createDocumentFragment();if(c.createElement)while(b.length)c.createElement(b.pop());return c}var eb="abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",fb=/ jQuery\d+="(?:null|\d+)"/g,gb=new RegExp("<(?:"+eb+")[\\s/>]","i"),hb=/^\s+/,ib=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,jb=/<([\w:]+)/,kb=/<tbody/i,lb=/<|&#?\w+;/,mb=/<(?:script|style|link)/i,nb=/checked\s*(?:[^=]|=\s*.checked.)/i,ob=/^$|\/(?:java|ecma)script/i,pb=/^true\/(.*)/,qb=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,rb={option:[1,"<select multiple='multiple'>","</select>"],legend:[1,"<fieldset>","</fieldset>"],area:[1,"<map>","</map>"],param:[1,"<object>","</object>"],thead:[1,"<table>","</table>"],tr:[2,"<table><tbody>","</tbody></table>"],col:[2,"<table><tbody></tbody><colgroup>","</colgroup></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:k.htmlSerialize?[0,"",""]:[1,"X<div>","</div>"]},sb=db(y),tb=sb.appendChild(y.createElement("div"));rb.optgroup=rb.option,rb.tbody=rb.tfoot=rb.colgroup=rb.caption=rb.thead,rb.th=rb.td;function ub(a,b){var c,d,e=0,f=typeof a.getElementsByTagName!==K?a.getElementsByTagName(b||"*"):typeof a.querySelectorAll!==K?a.querySelectorAll(b||"*"):void 0;if(!f)for(f=[],c=a.childNodes||a;null!=(d=c[e]);e++)!b||m.nodeName(d,b)?f.push(d):m.merge(f,ub(d,b));return void 0===b||b&&m.nodeName(a,b)?m.merge([a],f):f}function vb(a){W.test(a.type)&&(a.defaultChecked=a.checked)}function wb(a,b){return m.nodeName(a,"table")&&m.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function xb(a){return a.type=(null!==m.find.attr(a,"type"))+"/"+a.type,a}function yb(a){var b=pb.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function zb(a,b){for(var c,d=0;null!=(c=a[d]);d++)m._data(c,"globalEval",!b||m._data(b[d],"globalEval"))}function Ab(a,b){if(1===b.nodeType&&m.hasData(a)){var c,d,e,f=m._data(a),g=m._data(b,f),h=f.events;if(h){delete g.handle,g.events={};for(c in h)for(d=0,e=h[c].length;e>d;d++)m.event.add(b,c,h[c][d])}g.data&&(g.data=m.extend({},g.data))}}function Bb(a,b){var c,d,e;if(1===b.nodeType){if(c=b.nodeName.toLowerCase(),!k.noCloneEvent&&b[m.expando]){e=m._data(b);for(d in e.events)m.removeEvent(b,d,e.handle);b.removeAttribute(m.expando)}"script"===c&&b.text!==a.text?(xb(b).text=a.text,yb(b)):"object"===c?(b.parentNode&&(b.outerHTML=a.outerHTML),k.html5Clone&&a.innerHTML&&!m.trim(b.innerHTML)&&(b.innerHTML=a.innerHTML)):"input"===c&&W.test(a.type)?(b.defaultChecked=b.checked=a.checked,b.value!==a.value&&(b.value=a.value)):"option"===c?b.defaultSelected=b.selected=a.defaultSelected:("input"===c||"textarea"===c)&&(b.defaultValue=a.defaultValue)}}m.extend({clone:function(a,b,c){var d,e,f,g,h,i=m.contains(a.ownerDocument,a);if(k.html5Clone||m.isXMLDoc(a)||!gb.test("<"+a.nodeName+">")?f=a.cloneNode(!0):(tb.innerHTML=a.outerHTML,tb.removeChild(f=tb.firstChild)),!(k.noCloneEvent&&k.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||m.isXMLDoc(a)))for(d=ub(f),h=ub(a),g=0;null!=(e=h[g]);++g)d[g]&&Bb(e,d[g]);if(b)if(c)for(h=h||ub(a),d=d||ub(f),g=0;null!=(e=h[g]);g++)Ab(e,d[g]);else Ab(a,f);return d=ub(f,"script"),d.length>0&&zb(d,!i&&ub(a,"script")),d=h=e=null,f},buildFragment:function(a,b,c,d){for(var e,f,g,h,i,j,l,n=a.length,o=db(b),p=[],q=0;n>q;q++)if(f=a[q],f||0===f)if("object"===m.type(f))m.merge(p,f.nodeType?[f]:f);else if(lb.test(f)){h=h||o.appendChild(b.createElement("div")),i=(jb.exec(f)||["",""])[1].toLowerCase(),l=rb[i]||rb._default,h.innerHTML=l[1]+f.replace(ib,"<$1></$2>")+l[2],e=l[0];while(e--)h=h.lastChild;if(!k.leadingWhitespace&&hb.test(f)&&p.push(b.createTextNode(hb.exec(f)[0])),!k.tbody){f="table"!==i||kb.test(f)?"<table>"!==l[1]||kb.test(f)?0:h:h.firstChild,e=f&&f.childNodes.length;while(e--)m.nodeName(j=f.childNodes[e],"tbody")&&!j.childNodes.length&&f.removeChild(j)}m.merge(p,h.childNodes),h.textContent="";while(h.firstChild)h.removeChild(h.firstChild);h=o.lastChild}else p.push(b.createTextNode(f));h&&o.removeChild(h),k.appendChecked||m.grep(ub(p,"input"),vb),q=0;while(f=p[q++])if((!d||-1===m.inArray(f,d))&&(g=m.contains(f.ownerDocument,f),h=ub(o.appendChild(f),"script"),g&&zb(h),c)){e=0;while(f=h[e++])ob.test(f.type||"")&&c.push(f)}return h=null,o},cleanData:function(a,b){for(var d,e,f,g,h=0,i=m.expando,j=m.cache,l=k.deleteExpando,n=m.event.special;null!=(d=a[h]);h++)if((b||m.acceptData(d))&&(f=d[i],g=f&&j[f])){if(g.events)for(e in g.events)n[e]?m.event.remove(d,e):m.removeEvent(d,e,g.handle);j[f]&&(delete j[f],l?delete d[i]:typeof d.removeAttribute!==K?d.removeAttribute(i):d[i]=null,c.push(f))}}}),m.fn.extend({text:function(a){return V(this,function(a){return void 0===a?m.text(this):this.empty().append((this[0]&&this[0].ownerDocument||y).createTextNode(a))},null,a,arguments.length)},append:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=wb(this,a);b.appendChild(a)}})},prepend:function(){return this.domManip(arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=wb(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return this.domManip(arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},remove:function(a,b){for(var c,d=a?m.filter(a,this):this,e=0;null!=(c=d[e]);e++)b||1!==c.nodeType||m.cleanData(ub(c)),c.parentNode&&(b&&m.contains(c.ownerDocument,c)&&zb(ub(c,"script")),c.parentNode.removeChild(c));return this},empty:function(){for(var a,b=0;null!=(a=this[b]);b++){1===a.nodeType&&m.cleanData(ub(a,!1));while(a.firstChild)a.removeChild(a.firstChild);a.options&&m.nodeName(a,"select")&&(a.options.length=0)}return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return m.clone(this,a,b)})},html:function(a){return V(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a)return 1===b.nodeType?b.innerHTML.replace(fb,""):void 0;if(!("string"!=typeof a||mb.test(a)||!k.htmlSerialize&&gb.test(a)||!k.leadingWhitespace&&hb.test(a)||rb[(jb.exec(a)||["",""])[1].toLowerCase()])){a=a.replace(ib,"<$1></$2>");try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(m.cleanData(ub(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=arguments[0];return this.domManip(arguments,function(b){a=this.parentNode,m.cleanData(ub(this)),a&&a.replaceChild(b,this)}),a&&(a.length||a.nodeType)?this:this.remove()},detach:function(a){return this.remove(a,!0)},domManip:function(a,b){a=e.apply([],a);var c,d,f,g,h,i,j=0,l=this.length,n=this,o=l-1,p=a[0],q=m.isFunction(p);if(q||l>1&&"string"==typeof p&&!k.checkClone&&nb.test(p))return this.each(function(c){var d=n.eq(c);q&&(a[0]=p.call(this,c,d.html())),d.domManip(a,b)});if(l&&(i=m.buildFragment(a,this[0].ownerDocument,!1,this),c=i.firstChild,1===i.childNodes.length&&(i=c),c)){for(g=m.map(ub(i,"script"),xb),f=g.length;l>j;j++)d=i,j!==o&&(d=m.clone(d,!0,!0),f&&m.merge(g,ub(d,"script"))),b.call(this[j],d,j);if(f)for(h=g[g.length-1].ownerDocument,m.map(g,yb),j=0;f>j;j++)d=g[j],ob.test(d.type||"")&&!m._data(d,"globalEval")&&m.contains(h,d)&&(d.src?m._evalUrl&&m._evalUrl(d.src):m.globalEval((d.text||d.textContent||d.innerHTML||"").replace(qb,"")));i=c=null}return this}}),m.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){m.fn[a]=function(a){for(var c,d=0,e=[],g=m(a),h=g.length-1;h>=d;d++)c=d===h?this:this.clone(!0),m(g[d])[b](c),f.apply(e,c.get());return this.pushStack(e)}});var Cb,Db={};function Eb(b,c){var d,e=m(c.createElement(b)).appendTo(c.body),f=a.getDefaultComputedStyle&&(d=a.getDefaultComputedStyle(e[0]))?d.display:m.css(e[0],"display");return e.detach(),f}function Fb(a){var b=y,c=Db[a];return c||(c=Eb(a,b),"none"!==c&&c||(Cb=(Cb||m("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=(Cb[0].contentWindow||Cb[0].contentDocument).document,b.write(),b.close(),c=Eb(a,b),Cb.detach()),Db[a]=c),c}!function(){var a;k.shrinkWrapBlocks=function(){if(null!=a)return a;a=!1;var b,c,d;return c=y.getElementsByTagName("body")[0],c&&c.style?(b=y.createElement("div"),d=y.createElement("div"),d.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(d).appendChild(b),typeof b.style.zoom!==K&&(b.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:1px;width:1px;zoom:1",b.appendChild(y.createElement("div")).style.width="5px",a=3!==b.offsetWidth),c.removeChild(d),a):void 0}}();var Gb=/^margin/,Hb=new RegExp("^("+S+")(?!px)[a-z%]+$","i"),Ib,Jb,Kb=/^(top|right|bottom|left)$/;a.getComputedStyle?(Ib=function(a){return a.ownerDocument.defaultView.getComputedStyle(a,null)},Jb=function(a,b,c){var d,e,f,g,h=a.style;return c=c||Ib(a),g=c?c.getPropertyValue(b)||c[b]:void 0,c&&(""!==g||m.contains(a.ownerDocument,a)||(g=m.style(a,b)),Hb.test(g)&&Gb.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f)),void 0===g?g:g+""}):y.documentElement.currentStyle&&(Ib=function(a){return a.currentStyle},Jb=function(a,b,c){var d,e,f,g,h=a.style;return c=c||Ib(a),g=c?c[b]:void 0,null==g&&h&&h[b]&&(g=h[b]),Hb.test(g)&&!Kb.test(b)&&(d=h.left,e=a.runtimeStyle,f=e&&e.left,f&&(e.left=a.currentStyle.left),h.left="fontSize"===b?"1em":g,g=h.pixelLeft+"px",h.left=d,f&&(e.left=f)),void 0===g?g:g+""||"auto"});function Lb(a,b){return{get:function(){var c=a();if(null!=c)return c?void delete this.get:(this.get=b).apply(this,arguments)}}}!function(){var b,c,d,e,f,g,h;if(b=y.createElement("div"),b.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",d=b.getElementsByTagName("a")[0],c=d&&d.style){c.cssText="float:left;opacity:.5",k.opacity="0.5"===c.opacity,k.cssFloat=!!c.cssFloat,b.style.backgroundClip="content-box",b.cloneNode(!0).style.backgroundClip="",k.clearCloneStyle="content-box"===b.style.backgroundClip,k.boxSizing=""===c.boxSizing||""===c.MozBoxSizing||""===c.WebkitBoxSizing,m.extend(k,{reliableHiddenOffsets:function(){return null==g&&i(),g},boxSizingReliable:function(){return null==f&&i(),f},pixelPosition:function(){return null==e&&i(),e},reliableMarginRight:function(){return null==h&&i(),h}});function i(){var b,c,d,i;c=y.getElementsByTagName("body")[0],c&&c.style&&(b=y.createElement("div"),d=y.createElement("div"),d.style.cssText="position:absolute;border:0;width:0;height:0;top:0;left:-9999px",c.appendChild(d).appendChild(b),b.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;display:block;margin-top:1%;top:1%;border:1px;padding:1px;width:4px;position:absolute",e=f=!1,h=!0,a.getComputedStyle&&(e="1%"!==(a.getComputedStyle(b,null)||{}).top,f="4px"===(a.getComputedStyle(b,null)||{width:"4px"}).width,i=b.appendChild(y.createElement("div")),i.style.cssText=b.style.cssText="-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",i.style.marginRight=i.style.width="0",b.style.width="1px",h=!parseFloat((a.getComputedStyle(i,null)||{}).marginRight)),b.innerHTML="<table><tr><td></td><td>t</td></tr></table>",i=b.getElementsByTagName("td"),i[0].style.cssText="margin:0;border:0;padding:0;display:none",g=0===i[0].offsetHeight,g&&(i[0].style.display="",i[1].style.display="none",g=0===i[0].offsetHeight),c.removeChild(d))}}}(),m.swap=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e};var Mb=/alpha\([^)]*\)/i,Nb=/opacity\s*=\s*([^)]*)/,Ob=/^(none|table(?!-c[ea]).+)/,Pb=new RegExp("^("+S+")(.*)$","i"),Qb=new RegExp("^([+-])=("+S+")","i"),Rb={position:"absolute",visibility:"hidden",display:"block"},Sb={letterSpacing:"0",fontWeight:"400"},Tb=["Webkit","O","Moz","ms"];function Ub(a,b){if(b in a)return b;var c=b.charAt(0).toUpperCase()+b.slice(1),d=b,e=Tb.length;while(e--)if(b=Tb[e]+c,b in a)return b;return d}function Vb(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=m._data(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&U(d)&&(f[g]=m._data(d,"olddisplay",Fb(d.nodeName)))):(e=U(d),(c&&"none"!==c||!e)&&m._data(d,"olddisplay",e?c:m.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}function Wb(a,b,c){var d=Pb.exec(b);return d?Math.max(0,d[1]-(c||0))+(d[2]||"px"):b}function Xb(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=m.css(a,c+T[f],!0,e)),d?("content"===c&&(g-=m.css(a,"padding"+T[f],!0,e)),"margin"!==c&&(g-=m.css(a,"border"+T[f]+"Width",!0,e))):(g+=m.css(a,"padding"+T[f],!0,e),"padding"!==c&&(g+=m.css(a,"border"+T[f]+"Width",!0,e)));return g}function Yb(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=Ib(a),g=k.boxSizing&&"border-box"===m.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=Jb(a,b,f),(0>e||null==e)&&(e=a.style[b]),Hb.test(e))return e;d=g&&(k.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Xb(a,b,c||(g?"border":"content"),d,f)+"px"}m.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=Jb(a,"opacity");return""===c?"1":c}}}},cssNumber:{columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":k.cssFloat?"cssFloat":"styleFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=m.camelCase(b),i=a.style;if(b=m.cssProps[h]||(m.cssProps[h]=Ub(i,h)),g=m.cssHooks[b]||m.cssHooks[h],void 0===c)return g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b];if(f=typeof c,"string"===f&&(e=Qb.exec(c))&&(c=(e[1]+1)*e[2]+parseFloat(m.css(a,b)),f="number"),null!=c&&c===c&&("number"!==f||m.cssNumber[h]||(c+="px"),k.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),!(g&&"set"in g&&void 0===(c=g.set(a,c,d)))))try{i[b]=c}catch(j){}}},css:function(a,b,c,d){var e,f,g,h=m.camelCase(b);return b=m.cssProps[h]||(m.cssProps[h]=Ub(a.style,h)),g=m.cssHooks[b]||m.cssHooks[h],g&&"get"in g&&(f=g.get(a,!0,c)),void 0===f&&(f=Jb(a,b,d)),"normal"===f&&b in Sb&&(f=Sb[b]),""===c||c?(e=parseFloat(f),c===!0||m.isNumeric(e)?e||0:f):f}}),m.each(["height","width"],function(a,b){m.cssHooks[b]={get:function(a,c,d){return c?Ob.test(m.css(a,"display"))&&0===a.offsetWidth?m.swap(a,Rb,function(){return Yb(a,b,d)}):Yb(a,b,d):void 0},set:function(a,c,d){var e=d&&Ib(a);return Wb(a,c,d?Xb(a,b,d,k.boxSizing&&"border-box"===m.css(a,"boxSizing",!1,e),e):0)}}}),k.opacity||(m.cssHooks.opacity={get:function(a,b){return Nb.test((b&&a.currentStyle?a.currentStyle.filter:a.style.filter)||"")?.01*parseFloat(RegExp.$1)+"":b?"1":""},set:function(a,b){var c=a.style,d=a.currentStyle,e=m.isNumeric(b)?"alpha(opacity="+100*b+")":"",f=d&&d.filter||c.filter||"";c.zoom=1,(b>=1||""===b)&&""===m.trim(f.replace(Mb,""))&&c.removeAttribute&&(c.removeAttribute("filter"),""===b||d&&!d.filter)||(c.filter=Mb.test(f)?f.replace(Mb,e):f+" "+e)}}),m.cssHooks.marginRight=Lb(k.reliableMarginRight,function(a,b){return b?m.swap(a,{display:"inline-block"},Jb,[a,"marginRight"]):void 0}),m.each({margin:"",padding:"",border:"Width"},function(a,b){m.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+T[d]+b]=f[d]||f[d-2]||f[0];return e}},Gb.test(a)||(m.cssHooks[a+b].set=Wb)}),m.fn.extend({css:function(a,b){return V(this,function(a,b,c){var d,e,f={},g=0;if(m.isArray(b)){for(d=Ib(a),e=b.length;e>g;g++)f[b[g]]=m.css(a,b[g],!1,d);return f}return void 0!==c?m.style(a,b,c):m.css(a,b)},a,b,arguments.length>1)},show:function(){return Vb(this,!0)},hide:function(){return Vb(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){U(this)?m(this).show():m(this).hide()})}});function Zb(a,b,c,d,e){return new Zb.prototype.init(a,b,c,d,e)}m.Tween=Zb,Zb.prototype={constructor:Zb,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||"swing",this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(m.cssNumber[c]?"":"px")
},cur:function(){var a=Zb.propHooks[this.prop];return a&&a.get?a.get(this):Zb.propHooks._default.get(this)},run:function(a){var b,c=Zb.propHooks[this.prop];return this.pos=b=this.options.duration?m.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Zb.propHooks._default.set(this),this}},Zb.prototype.init.prototype=Zb.prototype,Zb.propHooks={_default:{get:function(a){var b;return null==a.elem[a.prop]||a.elem.style&&null!=a.elem.style[a.prop]?(b=m.css(a.elem,a.prop,""),b&&"auto"!==b?b:0):a.elem[a.prop]},set:function(a){m.fx.step[a.prop]?m.fx.step[a.prop](a):a.elem.style&&(null!=a.elem.style[m.cssProps[a.prop]]||m.cssHooks[a.prop])?m.style(a.elem,a.prop,a.now+a.unit):a.elem[a.prop]=a.now}}},Zb.propHooks.scrollTop=Zb.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},m.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2}},m.fx=Zb.prototype.init,m.fx.step={};var $b,_b,ac=/^(?:toggle|show|hide)$/,bc=new RegExp("^(?:([+-])=|)("+S+")([a-z%]*)$","i"),cc=/queueHooks$/,dc=[ic],ec={"*":[function(a,b){var c=this.createTween(a,b),d=c.cur(),e=bc.exec(b),f=e&&e[3]||(m.cssNumber[a]?"":"px"),g=(m.cssNumber[a]||"px"!==f&&+d)&&bc.exec(m.css(c.elem,a)),h=1,i=20;if(g&&g[3]!==f){f=f||g[3],e=e||[],g=+d||1;do h=h||".5",g/=h,m.style(c.elem,a,g+f);while(h!==(h=c.cur()/d)&&1!==h&&--i)}return e&&(g=c.start=+g||+d||0,c.unit=f,c.end=e[1]?g+(e[1]+1)*e[2]:+e[2]),c}]};function fc(){return setTimeout(function(){$b=void 0}),$b=m.now()}function gc(a,b){var c,d={height:a},e=0;for(b=b?1:0;4>e;e+=2-b)c=T[e],d["margin"+c]=d["padding"+c]=a;return b&&(d.opacity=d.width=a),d}function hc(a,b,c){for(var d,e=(ec[b]||[]).concat(ec["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function ic(a,b,c){var d,e,f,g,h,i,j,l,n=this,o={},p=a.style,q=a.nodeType&&U(a),r=m._data(a,"fxshow");c.queue||(h=m._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,n.always(function(){n.always(function(){h.unqueued--,m.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[p.overflow,p.overflowX,p.overflowY],j=m.css(a,"display"),l="none"===j?m._data(a,"olddisplay")||Fb(a.nodeName):j,"inline"===l&&"none"===m.css(a,"float")&&(k.inlineBlockNeedsLayout&&"inline"!==Fb(a.nodeName)?p.zoom=1:p.display="inline-block")),c.overflow&&(p.overflow="hidden",k.shrinkWrapBlocks()||n.always(function(){p.overflow=c.overflow[0],p.overflowX=c.overflow[1],p.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],ac.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(q?"hide":"show")){if("show"!==e||!r||void 0===r[d])continue;q=!0}o[d]=r&&r[d]||m.style(a,d)}else j=void 0;if(m.isEmptyObject(o))"inline"===("none"===j?Fb(a.nodeName):j)&&(p.display=j);else{r?"hidden"in r&&(q=r.hidden):r=m._data(a,"fxshow",{}),f&&(r.hidden=!q),q?m(a).show():n.done(function(){m(a).hide()}),n.done(function(){var b;m._removeData(a,"fxshow");for(b in o)m.style(a,b,o[b])});for(d in o)g=hc(q?r[d]:0,d,n),d in r||(r[d]=g.start,q&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function jc(a,b){var c,d,e,f,g;for(c in a)if(d=m.camelCase(c),e=b[d],f=a[c],m.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=m.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function kc(a,b,c){var d,e,f=0,g=dc.length,h=m.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=$b||fc(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:m.extend({},b),opts:m.extend(!0,{specialEasing:{}},c),originalProperties:b,originalOptions:c,startTime:$b||fc(),duration:c.duration,tweens:[],createTween:function(b,c){var d=m.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?h.resolveWith(a,[j,b]):h.rejectWith(a,[j,b]),this}}),k=j.props;for(jc(k,j.opts.specialEasing);g>f;f++)if(d=dc[f].call(j,a,k,j.opts))return d;return m.map(k,hc,j),m.isFunction(j.opts.start)&&j.opts.start.call(a,j),m.fx.timer(m.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}m.Animation=m.extend(kc,{tweener:function(a,b){m.isFunction(a)?(b=a,a=["*"]):a=a.split(" ");for(var c,d=0,e=a.length;e>d;d++)c=a[d],ec[c]=ec[c]||[],ec[c].unshift(b)},prefilter:function(a,b){b?dc.unshift(a):dc.push(a)}}),m.speed=function(a,b,c){var d=a&&"object"==typeof a?m.extend({},a):{complete:c||!c&&b||m.isFunction(a)&&a,duration:a,easing:c&&b||b&&!m.isFunction(b)&&b};return d.duration=m.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in m.fx.speeds?m.fx.speeds[d.duration]:m.fx.speeds._default,(null==d.queue||d.queue===!0)&&(d.queue="fx"),d.old=d.complete,d.complete=function(){m.isFunction(d.old)&&d.old.call(this),d.queue&&m.dequeue(this,d.queue)},d},m.fn.extend({fadeTo:function(a,b,c,d){return this.filter(U).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=m.isEmptyObject(a),f=m.speed(b,c,d),g=function(){var b=kc(this,m.extend({},a),f);(e||m._data(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=m.timers,g=m._data(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&cc.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));(b||!c)&&m.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=m._data(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=m.timers,g=d?d.length:0;for(c.finish=!0,m.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),m.each(["toggle","show","hide"],function(a,b){var c=m.fn[b];m.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(gc(b,!0),a,d,e)}}),m.each({slideDown:gc("show"),slideUp:gc("hide"),slideToggle:gc("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){m.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),m.timers=[],m.fx.tick=function(){var a,b=m.timers,c=0;for($b=m.now();c<b.length;c++)a=b[c],a()||b[c]!==a||b.splice(c--,1);b.length||m.fx.stop(),$b=void 0},m.fx.timer=function(a){m.timers.push(a),a()?m.fx.start():m.timers.pop()},m.fx.interval=13,m.fx.start=function(){_b||(_b=setInterval(m.fx.tick,m.fx.interval))},m.fx.stop=function(){clearInterval(_b),_b=null},m.fx.speeds={slow:600,fast:200,_default:400},m.fn.delay=function(a,b){return a=m.fx?m.fx.speeds[a]||a:a,b=b||"fx",this.queue(b,function(b,c){var d=setTimeout(b,a);c.stop=function(){clearTimeout(d)}})},function(){var a,b,c,d,e;b=y.createElement("div"),b.setAttribute("className","t"),b.innerHTML="  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>",d=b.getElementsByTagName("a")[0],c=y.createElement("select"),e=c.appendChild(y.createElement("option")),a=b.getElementsByTagName("input")[0],d.style.cssText="top:1px",k.getSetAttribute="t"!==b.className,k.style=/top/.test(d.getAttribute("style")),k.hrefNormalized="/a"===d.getAttribute("href"),k.checkOn=!!a.value,k.optSelected=e.selected,k.enctype=!!y.createElement("form").enctype,c.disabled=!0,k.optDisabled=!e.disabled,a=y.createElement("input"),a.setAttribute("value",""),k.input=""===a.getAttribute("value"),a.value="t",a.setAttribute("type","radio"),k.radioValue="t"===a.value}();var lc=/\r/g;m.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=m.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,m(this).val()):a,null==e?e="":"number"==typeof e?e+="":m.isArray(e)&&(e=m.map(e,function(a){return null==a?"":a+""})),b=m.valHooks[this.type]||m.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=m.valHooks[e.type]||m.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(lc,""):null==c?"":c)}}}),m.extend({valHooks:{option:{get:function(a){var b=m.find.attr(a,"value");return null!=b?b:m.trim(m.text(a))}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],!(!c.selected&&i!==e||(k.optDisabled?c.disabled:null!==c.getAttribute("disabled"))||c.parentNode.disabled&&m.nodeName(c.parentNode,"optgroup"))){if(b=m(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=m.makeArray(b),g=e.length;while(g--)if(d=e[g],m.inArray(m.valHooks.option.get(d),f)>=0)try{d.selected=c=!0}catch(h){d.scrollHeight}else d.selected=!1;return c||(a.selectedIndex=-1),e}}}}),m.each(["radio","checkbox"],function(){m.valHooks[this]={set:function(a,b){return m.isArray(b)?a.checked=m.inArray(m(a).val(),b)>=0:void 0}},k.checkOn||(m.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})});var mc,nc,oc=m.expr.attrHandle,pc=/^(?:checked|selected)$/i,qc=k.getSetAttribute,rc=k.input;m.fn.extend({attr:function(a,b){return V(this,m.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){m.removeAttr(this,a)})}}),m.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(a&&3!==f&&8!==f&&2!==f)return typeof a.getAttribute===K?m.prop(a,b,c):(1===f&&m.isXMLDoc(a)||(b=b.toLowerCase(),d=m.attrHooks[b]||(m.expr.match.bool.test(b)?nc:mc)),void 0===c?d&&"get"in d&&null!==(e=d.get(a,b))?e:(e=m.find.attr(a,b),null==e?void 0:e):null!==c?d&&"set"in d&&void 0!==(e=d.set(a,c,b))?e:(a.setAttribute(b,c+""),c):void m.removeAttr(a,b))},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(E);if(f&&1===a.nodeType)while(c=f[e++])d=m.propFix[c]||c,m.expr.match.bool.test(c)?rc&&qc||!pc.test(c)?a[d]=!1:a[m.camelCase("default-"+c)]=a[d]=!1:m.attr(a,c,""),a.removeAttribute(qc?c:d)},attrHooks:{type:{set:function(a,b){if(!k.radioValue&&"radio"===b&&m.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}}}),nc={set:function(a,b,c){return b===!1?m.removeAttr(a,c):rc&&qc||!pc.test(c)?a.setAttribute(!qc&&m.propFix[c]||c,c):a[m.camelCase("default-"+c)]=a[c]=!0,c}},m.each(m.expr.match.bool.source.match(/\w+/g),function(a,b){var c=oc[b]||m.find.attr;oc[b]=rc&&qc||!pc.test(b)?function(a,b,d){var e,f;return d||(f=oc[b],oc[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,oc[b]=f),e}:function(a,b,c){return c?void 0:a[m.camelCase("default-"+b)]?b.toLowerCase():null}}),rc&&qc||(m.attrHooks.value={set:function(a,b,c){return m.nodeName(a,"input")?void(a.defaultValue=b):mc&&mc.set(a,b,c)}}),qc||(mc={set:function(a,b,c){var d=a.getAttributeNode(c);return d||a.setAttributeNode(d=a.ownerDocument.createAttribute(c)),d.value=b+="","value"===c||b===a.getAttribute(c)?b:void 0}},oc.id=oc.name=oc.coords=function(a,b,c){var d;return c?void 0:(d=a.getAttributeNode(b))&&""!==d.value?d.value:null},m.valHooks.button={get:function(a,b){var c=a.getAttributeNode(b);return c&&c.specified?c.value:void 0},set:mc.set},m.attrHooks.contenteditable={set:function(a,b,c){mc.set(a,""===b?!1:b,c)}},m.each(["width","height"],function(a,b){m.attrHooks[b]={set:function(a,c){return""===c?(a.setAttribute(b,"auto"),c):void 0}}})),k.style||(m.attrHooks.style={get:function(a){return a.style.cssText||void 0},set:function(a,b){return a.style.cssText=b+""}});var sc=/^(?:input|select|textarea|button|object)$/i,tc=/^(?:a|area)$/i;m.fn.extend({prop:function(a,b){return V(this,m.prop,a,b,arguments.length>1)},removeProp:function(a){return a=m.propFix[a]||a,this.each(function(){try{this[a]=void 0,delete this[a]}catch(b){}})}}),m.extend({propFix:{"for":"htmlFor","class":"className"},prop:function(a,b,c){var d,e,f,g=a.nodeType;if(a&&3!==g&&8!==g&&2!==g)return f=1!==g||!m.isXMLDoc(a),f&&(b=m.propFix[b]||b,e=m.propHooks[b]),void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){var b=m.find.attr(a,"tabindex");return b?parseInt(b,10):sc.test(a.nodeName)||tc.test(a.nodeName)&&a.href?0:-1}}}}),k.hrefNormalized||m.each(["href","src"],function(a,b){m.propHooks[b]={get:function(a){return a.getAttribute(b,4)}}}),k.optSelected||(m.propHooks.selected={get:function(a){var b=a.parentNode;return b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex),null}}),m.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){m.propFix[this.toLowerCase()]=this}),k.enctype||(m.propFix.enctype="encoding");var uc=/[\t\r\n\f]/g;m.fn.extend({addClass:function(a){var b,c,d,e,f,g,h=0,i=this.length,j="string"==typeof a&&a;if(m.isFunction(a))return this.each(function(b){m(this).addClass(a.call(this,b,this.className))});if(j)for(b=(a||"").match(E)||[];i>h;h++)if(c=this[h],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(uc," "):" ")){f=0;while(e=b[f++])d.indexOf(" "+e+" ")<0&&(d+=e+" ");g=m.trim(d),c.className!==g&&(c.className=g)}return this},removeClass:function(a){var b,c,d,e,f,g,h=0,i=this.length,j=0===arguments.length||"string"==typeof a&&a;if(m.isFunction(a))return this.each(function(b){m(this).removeClass(a.call(this,b,this.className))});if(j)for(b=(a||"").match(E)||[];i>h;h++)if(c=this[h],d=1===c.nodeType&&(c.className?(" "+c.className+" ").replace(uc," "):"")){f=0;while(e=b[f++])while(d.indexOf(" "+e+" ")>=0)d=d.replace(" "+e+" "," ");g=a?m.trim(d):"",c.className!==g&&(c.className=g)}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):this.each(m.isFunction(a)?function(c){m(this).toggleClass(a.call(this,c,this.className,b),b)}:function(){if("string"===c){var b,d=0,e=m(this),f=a.match(E)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else(c===K||"boolean"===c)&&(this.className&&m._data(this,"__className__",this.className),this.className=this.className||a===!1?"":m._data(this,"__className__")||"")})},hasClass:function(a){for(var b=" "+a+" ",c=0,d=this.length;d>c;c++)if(1===this[c].nodeType&&(" "+this[c].className+" ").replace(uc," ").indexOf(b)>=0)return!0;return!1}}),m.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){m.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),m.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)},bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)}});var vc=m.now(),wc=/\?/,xc=/(,)|(\[|{)|(}|])|"(?:[^"\\\r\n]|\\["\\\/bfnrt]|\\u[\da-fA-F]{4})*"\s*:?|true|false|null|-?(?!0\d)\d+(?:\.\d+|)(?:[eE][+-]?\d+|)/g;m.parseJSON=function(b){if(a.JSON&&a.JSON.parse)return a.JSON.parse(b+"");var c,d=null,e=m.trim(b+"");return e&&!m.trim(e.replace(xc,function(a,b,e,f){return c&&b&&(d=0),0===d?a:(c=e||b,d+=!f-!e,"")}))?Function("return "+e)():m.error("Invalid JSON: "+b)},m.parseXML=function(b){var c,d;if(!b||"string"!=typeof b)return null;try{a.DOMParser?(d=new DOMParser,c=d.parseFromString(b,"text/xml")):(c=new ActiveXObject("Microsoft.XMLDOM"),c.async="false",c.loadXML(b))}catch(e){c=void 0}return c&&c.documentElement&&!c.getElementsByTagName("parsererror").length||m.error("Invalid XML: "+b),c};var yc,zc,Ac=/#.*$/,Bc=/([?&])_=[^&]*/,Cc=/^(.*?):[ \t]*([^\r\n]*)\r?$/gm,Dc=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,Ec=/^(?:GET|HEAD)$/,Fc=/^\/\//,Gc=/^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,Hc={},Ic={},Jc="*/".concat("*");try{zc=location.href}catch(Kc){zc=y.createElement("a"),zc.href="",zc=zc.href}yc=Gc.exec(zc.toLowerCase())||[];function Lc(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(E)||[];if(m.isFunction(c))while(d=f[e++])"+"===d.charAt(0)?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function Mc(a,b,c,d){var e={},f=a===Ic;function g(h){var i;return e[h]=!0,m.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function Nc(a,b){var c,d,e=m.ajaxSettings.flatOptions||{};for(d in b)void 0!==b[d]&&((e[d]?a:c||(c={}))[d]=b[d]);return c&&m.extend(!0,a,c),a}function Oc(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===e&&(e=a.mimeType||b.getResponseHeader("Content-Type"));if(e)for(g in h)if(h[g]&&h[g].test(e)){i.unshift(g);break}if(i[0]in c)f=i[0];else{for(g in c){if(!i[0]||a.converters[g+" "+i[0]]){f=g;break}d||(d=g)}f=f||d}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function Pc(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}m.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:zc,type:"GET",isLocal:Dc.test(yc[1]),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":Jc,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/xml/,html:/html/,json:/json/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":m.parseJSON,"text xml":m.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?Nc(Nc(a,m.ajaxSettings),b):Nc(m.ajaxSettings,a)},ajaxPrefilter:Lc(Hc),ajaxTransport:Lc(Ic),ajax:function(a,b){"object"==typeof a&&(b=a,a=void 0),b=b||{};var c,d,e,f,g,h,i,j,k=m.ajaxSetup({},b),l=k.context||k,n=k.context&&(l.nodeType||l.jquery)?m(l):m.event,o=m.Deferred(),p=m.Callbacks("once memory"),q=k.statusCode||{},r={},s={},t=0,u="canceled",v={readyState:0,getResponseHeader:function(a){var b;if(2===t){if(!j){j={};while(b=Cc.exec(f))j[b[1].toLowerCase()]=b[2]}b=j[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===t?f:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return t||(a=s[c]=s[c]||a,r[a]=b),this},overrideMimeType:function(a){return t||(k.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>t)for(b in a)q[b]=[q[b],a[b]];else v.always(a[v.status]);return this},abort:function(a){var b=a||u;return i&&i.abort(b),x(0,b),this}};if(o.promise(v).complete=p.add,v.success=v.done,v.error=v.fail,k.url=((a||k.url||zc)+"").replace(Ac,"").replace(Fc,yc[1]+"//"),k.type=b.method||b.type||k.method||k.type,k.dataTypes=m.trim(k.dataType||"*").toLowerCase().match(E)||[""],null==k.crossDomain&&(c=Gc.exec(k.url.toLowerCase()),k.crossDomain=!(!c||c[1]===yc[1]&&c[2]===yc[2]&&(c[3]||("http:"===c[1]?"80":"443"))===(yc[3]||("http:"===yc[1]?"80":"443")))),k.data&&k.processData&&"string"!=typeof k.data&&(k.data=m.param(k.data,k.traditional)),Mc(Hc,k,b,v),2===t)return v;h=k.global,h&&0===m.active++&&m.event.trigger("ajaxStart"),k.type=k.type.toUpperCase(),k.hasContent=!Ec.test(k.type),e=k.url,k.hasContent||(k.data&&(e=k.url+=(wc.test(e)?"&":"?")+k.data,delete k.data),k.cache===!1&&(k.url=Bc.test(e)?e.replace(Bc,"$1_="+vc++):e+(wc.test(e)?"&":"?")+"_="+vc++)),k.ifModified&&(m.lastModified[e]&&v.setRequestHeader("If-Modified-Since",m.lastModified[e]),m.etag[e]&&v.setRequestHeader("If-None-Match",m.etag[e])),(k.data&&k.hasContent&&k.contentType!==!1||b.contentType)&&v.setRequestHeader("Content-Type",k.contentType),v.setRequestHeader("Accept",k.dataTypes[0]&&k.accepts[k.dataTypes[0]]?k.accepts[k.dataTypes[0]]+("*"!==k.dataTypes[0]?", "+Jc+"; q=0.01":""):k.accepts["*"]);for(d in k.headers)v.setRequestHeader(d,k.headers[d]);if(k.beforeSend&&(k.beforeSend.call(l,v,k)===!1||2===t))return v.abort();u="abort";for(d in{success:1,error:1,complete:1})v[d](k[d]);if(i=Mc(Ic,k,b,v)){v.readyState=1,h&&n.trigger("ajaxSend",[v,k]),k.async&&k.timeout>0&&(g=setTimeout(function(){v.abort("timeout")},k.timeout));try{t=1,i.send(r,x)}catch(w){if(!(2>t))throw w;x(-1,w)}}else x(-1,"No Transport");function x(a,b,c,d){var j,r,s,u,w,x=b;2!==t&&(t=2,g&&clearTimeout(g),i=void 0,f=d||"",v.readyState=a>0?4:0,j=a>=200&&300>a||304===a,c&&(u=Oc(k,v,c)),u=Pc(k,u,v,j),j?(k.ifModified&&(w=v.getResponseHeader("Last-Modified"),w&&(m.lastModified[e]=w),w=v.getResponseHeader("etag"),w&&(m.etag[e]=w)),204===a||"HEAD"===k.type?x="nocontent":304===a?x="notmodified":(x=u.state,r=u.data,s=u.error,j=!s)):(s=x,(a||!x)&&(x="error",0>a&&(a=0))),v.status=a,v.statusText=(b||x)+"",j?o.resolveWith(l,[r,x,v]):o.rejectWith(l,[v,x,s]),v.statusCode(q),q=void 0,h&&n.trigger(j?"ajaxSuccess":"ajaxError",[v,k,j?r:s]),p.fireWith(l,[v,x]),h&&(n.trigger("ajaxComplete",[v,k]),--m.active||m.event.trigger("ajaxStop")))}return v},getJSON:function(a,b,c){return m.get(a,b,c,"json")},getScript:function(a,b){return m.get(a,void 0,b,"script")}}),m.each(["get","post"],function(a,b){m[b]=function(a,c,d,e){return m.isFunction(c)&&(e=e||d,d=c,c=void 0),m.ajax({url:a,type:b,dataType:e,data:c,success:d})}}),m.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){m.fn[b]=function(a){return this.on(b,a)}}),m._evalUrl=function(a){return m.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},m.fn.extend({wrapAll:function(a){if(m.isFunction(a))return this.each(function(b){m(this).wrapAll(a.call(this,b))});if(this[0]){var b=m(a,this[0].ownerDocument).eq(0).clone(!0);this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstChild&&1===a.firstChild.nodeType)a=a.firstChild;return a}).append(this)}return this},wrapInner:function(a){return this.each(m.isFunction(a)?function(b){m(this).wrapInner(a.call(this,b))}:function(){var b=m(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=m.isFunction(a);return this.each(function(c){m(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){m.nodeName(this,"body")||m(this).replaceWith(this.childNodes)}).end()}}),m.expr.filters.hidden=function(a){return a.offsetWidth<=0&&a.offsetHeight<=0||!k.reliableHiddenOffsets()&&"none"===(a.style&&a.style.display||m.css(a,"display"))},m.expr.filters.visible=function(a){return!m.expr.filters.hidden(a)};var Qc=/%20/g,Rc=/\[\]$/,Sc=/\r?\n/g,Tc=/^(?:submit|button|image|reset|file)$/i,Uc=/^(?:input|select|textarea|keygen)/i;function Vc(a,b,c,d){var e;if(m.isArray(b))m.each(b,function(b,e){c||Rc.test(a)?d(a,e):Vc(a+"["+("object"==typeof e?b:"")+"]",e,c,d)});else if(c||"object"!==m.type(b))d(a,b);else for(e in b)Vc(a+"["+e+"]",b[e],c,d)}m.param=function(a,b){var c,d=[],e=function(a,b){b=m.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=m.ajaxSettings&&m.ajaxSettings.traditional),m.isArray(a)||a.jquery&&!m.isPlainObject(a))m.each(a,function(){e(this.name,this.value)});else for(c in a)Vc(c,a[c],b,e);return d.join("&").replace(Qc,"+")},m.fn.extend({serialize:function(){return m.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=m.prop(this,"elements");return a?m.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!m(this).is(":disabled")&&Uc.test(this.nodeName)&&!Tc.test(a)&&(this.checked||!W.test(a))}).map(function(a,b){var c=m(this).val();return null==c?null:m.isArray(c)?m.map(c,function(a){return{name:b.name,value:a.replace(Sc,"\r\n")}}):{name:b.name,value:c.replace(Sc,"\r\n")}}).get()}}),m.ajaxSettings.xhr=void 0!==a.ActiveXObject?function(){return!this.isLocal&&/^(get|post|head|put|delete|options)$/i.test(this.type)&&Zc()||$c()}:Zc;var Wc=0,Xc={},Yc=m.ajaxSettings.xhr();a.ActiveXObject&&m(a).on("unload",function(){for(var a in Xc)Xc[a](void 0,!0)}),k.cors=!!Yc&&"withCredentials"in Yc,Yc=k.ajax=!!Yc,Yc&&m.ajaxTransport(function(a){if(!a.crossDomain||k.cors){var b;return{send:function(c,d){var e,f=a.xhr(),g=++Wc;if(f.open(a.type,a.url,a.async,a.username,a.password),a.xhrFields)for(e in a.xhrFields)f[e]=a.xhrFields[e];a.mimeType&&f.overrideMimeType&&f.overrideMimeType(a.mimeType),a.crossDomain||c["X-Requested-With"]||(c["X-Requested-With"]="XMLHttpRequest");for(e in c)void 0!==c[e]&&f.setRequestHeader(e,c[e]+"");f.send(a.hasContent&&a.data||null),b=function(c,e){var h,i,j;if(b&&(e||4===f.readyState))if(delete Xc[g],b=void 0,f.onreadystatechange=m.noop,e)4!==f.readyState&&f.abort();else{j={},h=f.status,"string"==typeof f.responseText&&(j.text=f.responseText);try{i=f.statusText}catch(k){i=""}h||!a.isLocal||a.crossDomain?1223===h&&(h=204):h=j.text?200:404}j&&d(h,i,j,f.getAllResponseHeaders())},a.async?4===f.readyState?setTimeout(b):f.onreadystatechange=Xc[g]=b:b()},abort:function(){b&&b(void 0,!0)}}}});function Zc(){try{return new a.XMLHttpRequest}catch(b){}}function $c(){try{return new a.ActiveXObject("Microsoft.XMLHTTP")}catch(b){}}m.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/(?:java|ecma)script/},converters:{"text script":function(a){return m.globalEval(a),a}}}),m.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET",a.global=!1)}),m.ajaxTransport("script",function(a){if(a.crossDomain){var b,c=y.head||m("head")[0]||y.documentElement;return{send:function(d,e){b=y.createElement("script"),b.async=!0,a.scriptCharset&&(b.charset=a.scriptCharset),b.src=a.url,b.onload=b.onreadystatechange=function(a,c){(c||!b.readyState||/loaded|complete/.test(b.readyState))&&(b.onload=b.onreadystatechange=null,b.parentNode&&b.parentNode.removeChild(b),b=null,c||e(200,"success"))},c.insertBefore(b,c.firstChild)},abort:function(){b&&b.onload(void 0,!0)}}}});var _c=[],ad=/(=)\?(?=&|$)|\?\?/;m.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=_c.pop()||m.expando+"_"+vc++;return this[a]=!0,a}}),m.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(ad.test(b.url)?"url":"string"==typeof b.data&&!(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&ad.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=m.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(ad,"$1"+e):b.jsonp!==!1&&(b.url+=(wc.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||m.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,_c.push(e)),g&&m.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),m.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||y;var d=u.exec(a),e=!c&&[];return d?[b.createElement(d[1])]:(d=m.buildFragment([a],b,e),e&&e.length&&m(e).remove(),m.merge([],d.childNodes))};var bd=m.fn.load;m.fn.load=function(a,b,c){if("string"!=typeof a&&bd)return bd.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>=0&&(d=m.trim(a.slice(h,a.length)),a=a.slice(0,h)),m.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(f="POST"),g.length>0&&m.ajax({url:a,type:f,dataType:"html",data:b}).done(function(a){e=arguments,g.html(d?m("<div>").append(m.parseHTML(a)).find(d):a)}).complete(c&&function(a,b){g.each(c,e||[a.responseText,b,a])}),this},m.expr.filters.animated=function(a){return m.grep(m.timers,function(b){return a===b.elem}).length};var cd=a.document.documentElement;function dd(a){return m.isWindow(a)?a:9===a.nodeType?a.defaultView||a.parentWindow:!1}m.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=m.css(a,"position"),l=m(a),n={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=m.css(a,"top"),i=m.css(a,"left"),j=("absolute"===k||"fixed"===k)&&m.inArray("auto",[f,i])>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),m.isFunction(b)&&(b=b.call(a,c,h)),null!=b.top&&(n.top=b.top-h.top+g),null!=b.left&&(n.left=b.left-h.left+e),"using"in b?b.using.call(a,n):l.css(n)}},m.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){m.offset.setOffset(this,a,b)});var b,c,d={top:0,left:0},e=this[0],f=e&&e.ownerDocument;if(f)return b=f.documentElement,m.contains(b,e)?(typeof e.getBoundingClientRect!==K&&(d=e.getBoundingClientRect()),c=dd(f),{top:d.top+(c.pageYOffset||b.scrollTop)-(b.clientTop||0),left:d.left+(c.pageXOffset||b.scrollLeft)-(b.clientLeft||0)}):d},position:function(){if(this[0]){var a,b,c={top:0,left:0},d=this[0];return"fixed"===m.css(d,"position")?b=d.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),m.nodeName(a[0],"html")||(c=a.offset()),c.top+=m.css(a[0],"borderTopWidth",!0),c.left+=m.css(a[0],"borderLeftWidth",!0)),{top:b.top-c.top-m.css(d,"marginTop",!0),left:b.left-c.left-m.css(d,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent||cd;while(a&&!m.nodeName(a,"html")&&"static"===m.css(a,"position"))a=a.offsetParent;return a||cd})}}),m.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(a,b){var c=/Y/.test(b);m.fn[a]=function(d){return V(this,function(a,d,e){var f=dd(a);return void 0===e?f?b in f?f[b]:f.document.documentElement[d]:a[d]:void(f?f.scrollTo(c?m(f).scrollLeft():e,c?e:m(f).scrollTop()):a[d]=e)},a,d,arguments.length,null)}}),m.each(["top","left"],function(a,b){m.cssHooks[b]=Lb(k.pixelPosition,function(a,c){return c?(c=Jb(a,b),Hb.test(c)?m(a).position()[b]+"px":c):void 0})}),m.each({Height:"height",Width:"width"},function(a,b){m.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){m.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return V(this,function(b,c,d){var e;return m.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?m.css(b,c,g):m.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),m.fn.size=function(){return this.length},m.fn.andSelf=m.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return m});var ed=a.jQuery,fd=a.$;return m.noConflict=function(b){return a.$===m&&(a.$=fd),b&&a.jQuery===m&&(a.jQuery=ed),m},typeof b===K&&(a.jQuery=a.$=m),m});
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 * The Location class detects and listens to the device's location.
 *
 * @param {Function} userLocationHandler A method to call when a location is
 * received.
 */
function LocationListener(userLocationHandler) {
  this.userLocationHandler = userLocationHandler;
}

LocationListener.LOCATION_RECEIVED = 'plus.codes.location.received';

/** Returns if location is supported by this browser/device. */
LocationListener.prototype.isSupported = function() {
  return 'geolocation' in navigator;
};

/** Returns if location has been previously received on this browser/device. */
LocationListener.prototype.hasReceived = function() {
  if (DataStore.get(LocationListener.LOCATION_RECEIVED) != null) {
    return true;
  }
  return false;
};

/**
 * Self calling method to request the location. This uses
 * geolocation.getCurrentPosition in preference to watchPosition so that
 * if we lose location signals, we can detect it.
 */
LocationListener.prototype.getCurrentLocation = function() {
  var that = this;
  navigator.geolocation.getCurrentPosition(
      function(position) {
        DataStore.putString(LocationListener.LOCATION_RECEIVED, 'true');
        try {
          that.userLocationHandler(
              position.coords.latitude, position.coords.longitude,
              position.coords.accuracy);
        } catch (e) {
        }
        // Call this again in five seconds.
        setTimeout(function() {that.getCurrentLocation()}, 5000);
      },
      function(error) {
        // Got an error from the location system.
        // Call this again in five seconds.
        setTimeout(function() {that.getCurrentLocation()}, 5000);
      },
      {timeout: 30000, enableHighAccuracy: true});
};
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/** Singleton class to represent the currently displayed code. */
function DisplayedCode() {

  if (arguments.callee._singletonInstance) {
    return arguments.callee._singletonInstance;
  }
  arguments.callee._singletonInstance = this;
  this.is_set = false;
  this.is_pinned = false;
  this.code = null;
  this.decoded = null;
  this.area_code = null;
  this.place_code = null;
  this.timestamp_millis = 0;
  this.neighbourhood = null;

  this.setCode = function(code) {
    this.code = code;
    this.codeArea = OpenLocationCode.decode(code);
    this.timestamp_millis = Date.now();
    if (this.codeArea.codeLength > 4) {
      this.area_code = this.code.substring(0, 4);
      this.place_code = this.code.substring(4);
      this.neighbourhood = this.code.substring(0, 9);
      this.neighbourhoodArea = OpenLocationCode.decode(this.neighbourhood);
    } else {
      this.area_code = null;
      this.place_code = null;
      this.neighbourhood = null;
      this.neighbourhoodArea = null;
    }
  };

  /** Set the code into the URL. */
  this.setUrl = function() {
    // Pathname can be host/OLC, host/path/OLC, host/path/path.html
    var paths = location.pathname.split('/');
    var newpath;
    // If the last one is an OLC code, drop it and replace it with the new one.
    if (location.search !== '') {
      newpath = location.pathname + '?q=' + this.code;
    } else if (paths[paths.length - 1].indexOf('+') > -1) {
      paths.pop();
      newpath = paths.join('/') + '/' + this.code;
    } else if (paths[paths.length - 1] == '') {
      paths.pop();
      newpath = paths.join('/') + '/' + this.code;
    } else {
      newpath = location.pathname + '?q=' + this.code;
    }

    window.history.pushState(
        'object or string',
        'plus+code: ' + this.code,
        newpath);
  };
}

/**
 * Maps code lengths to zoom levels. Each entry gives the code length and the
 * minimum zoom level for that code length.
 */
var CodeLengthZoom = [
  {'code':4, 'zoom':0},
  {'code':6, 'zoom':8},
  {'code':8, 'zoom':14},
  {'code':10, 'zoom':18},
  {'code':11, 'zoom':20}
];

/** Set up global variables and objects. */
function init() {
  // The current code - from the URL, search or map click.
  displayedCode = new DisplayedCode();
  codePendingGeocoding = null;

  // Create a cache for codes and addresses.
  codeAddressCache = new SimpleCache();

  // Get the messages in different languages.
  messages = new Messages();

  // Location of the device as a tuple of lat/lng (null until we get something).
  deviceLatLng = null;

  // Did we have a code in the URL?
  var urlCode = getCodeFromUrl();
  if (urlCode != null && OpenLocationCode.isValid(urlCode)) {
    displayedCode.setCode(urlCode);
    displayedCode.setUrl();
    displayedCode.is_pinned = true;
    pushPushPin();
    displayCodeInformation(displayedCode);
  }

  // Create the various objects we need.
  locationListener = new LocationListener(receiveDeviceLocation);
  map = new MapController(document.querySelector('.map'));
  compass = new CompassController(document.querySelector('.compass_container'));
  compass.initialise();

  // If we have any feedback left over.
  Feedback.sendFeedback();
}

/** Called when the map is zoomed. */
function receiveMapZoomEvent() {
  updateLocationButton();
  // Redraw the user's location marker so it can be seen. */
  map.redrawLocationMarker();
  map.setCodeMarker(
      displayedCode.codeArea.latitudeLo,
      displayedCode.codeArea.longitudeLo,
      displayedCode.codeArea.latitudeHi,
      displayedCode.codeArea.longitudeHi);
}

var lastMapClickMillis = 0;
/** Called when user clicks or taps on the map. Uses click location as a new code. */
function receiveMapClickEvent(event) {
  var now = new Date().getTime();
  var lastClick = lastMapClickMillis;
  lastMapClickMillis = now;
  if (displayedCode.is_pinned) {
    if (now - lastClick < 3000) {
      // Tapped twice in 3 seconds - they're probably confused why the first tap
      // did nothing, so unpin and continue with the tap.
      togglePushPin();
    } else {
      // It's pinned, so ignore the tap. They should unpin the current location.
      return;
    }
  }
  var zoom = map.map.getZoom();
  var center = map.map.getCenter();
  var codeLength = 4;
  for (var i = 0; i < CodeLengthZoom.length; i++) {
    if (zoom >= CodeLengthZoom[i].zoom) {
      codeLength = CodeLengthZoom[i].code;
    }
  }
  var newcode = OpenLocationCode.encode(event.latLng.lat(), event.latLng.lng(), codeLength);
  if (displayedCode.code == newcode) {
    return;
  }
  displayedCode.setCode(newcode);
  displayedCode.setUrl();
  displayCodeInformation(displayedCode);
  map.setCodeMarker(
      displayedCode.codeArea.latitudeLo,
      displayedCode.codeArea.longitudeLo,
      displayedCode.codeArea.latitudeHi,
      displayedCode.codeArea.longitudeHi);
  map.zoomToCenter(
      displayedCode.codeArea.latitudeCenter,
      displayedCode.codeArea.longitudeCenter,
      zoom);
}

/** Called when the user drags or zooms the map. */
function receiveMapBoundsEvent() {
  updateLocationButton();
  // Is the displayed code pinned?
  if (displayedCode.is_pinned) {
    return;
  }
  if (map.map == null) {
    return;
  }
  // Not pinned - so create a new code using a combination of the zoom level and
  // the map center.
  var zoom = map.map.getZoom();
  var center = map.map.getCenter();
  var codeLength = 4;
  for (var i = 0; i < CodeLengthZoom.length; i++) {
    if (zoom >= CodeLengthZoom[i].zoom) {
      codeLength = CodeLengthZoom[i].code;
    }
  }
  var newcode = OpenLocationCode.encode(center.lat(), center.lng(), codeLength);
  if (displayedCode.code == newcode) {
    return;
  }
  displayedCode.setCode(newcode);
  // Set it into the URL unless it's the map default location.
  if (zoom != MapController._DEFAULT_ZOOM || center != MapController._DEFAULT_CENTER) {
    displayedCode.setUrl();
  }
  displayCodeInformation(displayedCode);
  map.setCodeMarker(
      displayedCode.codeArea.latitudeLo,
      displayedCode.codeArea.longitudeLo,
      displayedCode.codeArea.latitudeHi,
      displayedCode.codeArea.longitudeHi);
}

/** Called when the map tiles are loaded. */
function receiveTilesLoadedEvent() {
  map.tilesLoaded = true;
  if (!map.isCodeMarkerDisplayed()) {
    map.setCodeMarker(
        displayedCode.codeArea.latitudeLo,
        displayedCode.codeArea.longitudeLo,
        displayedCode.codeArea.latitudeHi,
        displayedCode.codeArea.longitudeHi);
    // Zooming in is easier than zooming out.
    zoomToCode();
  }
}


/** Called with device location updates. */
function receiveDeviceLocation(lat, lng, accuracy) {
  map.setLocationMarker(lat, lng, accuracy);
  if (deviceLatLng === null && !displayedCode.is_pinned) {
    // We have a code but it's not pinned, so if this is the first
    // location update, let's go there.
    displayedCode.setCode(OpenLocationCode.encode(lat, lng));
    compass.setPoints(lat, lng,
        displayedCode.codeArea.latitudeCenter,
        displayedCode.codeArea.longitudeCenter);
    map.setCodeMarker(
        displayedCode.codeArea.latitudeLo,
        displayedCode.codeArea.longitudeLo,
        displayedCode.codeArea.latitudeHi,
        displayedCode.codeArea.longitudeHi);
    // Zooming in is easier than zooming out.
    zoomToCode();
    displayCodeInformation(displayedCode);
  } else if (displayedCode.code != null) {
    compass.setPoints(lat, lng,
        displayedCode.codeArea.latitudeCenter,
        displayedCode.codeArea.longitudeCenter);
  }
  if (deviceLatLng === null) {
    $('button.compass').addClass('reveal');
  }
  // Save the current location.
  deviceLatLng = [lat, lng];
  // Update the button status depending on whether the current location is
  // within the map view.
  updateLocationButton();
}


/**
 * Zoom the map to show the code.
 */
function zoomToCode(code_opt) {
  var codeArea = displayedCode.codeArea;
  if (typeof code_opt != 'undefined') {
    codeArea = OpenLocationCode.decode(code_opt);
  }
  // Get the zoom level for this code length.
  var zoomLevel = 4;
  for (var i = 0; i < CodeLengthZoom.length; i++) {
    if (codeArea.codeLength >= CodeLengthZoom[i].code) {
      zoomLevel = CodeLengthZoom[i].zoom;
    }
  }
  map.zoomToCenter(
      codeArea.latitudeCenter, codeArea.longitudeCenter, zoomLevel);
}


/**
 *
 * Split user search input into the different parts.
 *
 * User search input should be an OLC code, and OLC code and an address,
 * or just an address.
 *
 * This splits it into the different parts, and returns an optional code
 * indicating a possible message to show the user (if an OLC code has been
 * included that doesn't have the '+' sign in it).
 *
 * @param {string} input A user input string.
 * @return {*} An array made up of [full code, short code, address, message, latLng].
 */
function splitSearchInput(input) {
  var bestFullCode = '';
  var bestShortCode = '';
  var address = [];
  var message = '';
  var latLng = '';
  // Check for just a lat,lng. This avoids us extracting it and then geocoding it.
  if (/^(\-?\d+(\.\d+)?),\s*(\-?\d+(\.\d+)?)$/.test(input)) {
    latLng = input;
  } else {
    // Split the input by whitespace, commas, colons.
    var fields = input.split(/[\s,:]+/);
    // Check each field of the input. We want to get the most specific OLC
    // code into the code var, and put everything else into the address var.
    while (fields.length > 0) {
      var field = fields.shift();
      // If it's a short OLC code longer than the previous short OLC code
      // save it.
      if (OpenLocationCode.isShort(field) &&
          field.length > bestShortCode.length) {
        bestShortCode = field;
      } else if (OpenLocationCode.isFull(field) &&
          !OpenLocationCode.isShort(field) &&
          field.length > bestFullCode.length &&
          field.length > 6) {
        // If this field looks like a long OLC code, it's not a short code,
        // it's longer than any other long code, save it.
        bestFullCode = field;
      } else {
        address.push(field);
      }
    }
    // Join all the fields that didn't look like OLC codes.
    address = address.join(' ');
    // Work out what to use as the OLC code. This works by blanking the code we
    // don't want to use!!!
    if (bestFullCode && bestShortCode) {
      if (bestFullCode.length >= 10) {
        // This is the best - clear the short code.
        bestShortCode = '';
      } else {
        // The short code is better - clear the full code.
        bestFullCode = '';
      }
    }
  }
  return {'full': bestFullCode, 'short': bestShortCode,
          'address': address, 'message': message, 'latLng': latLng};
}


/**
 * Display information about a code in the infobox.
 */
function displayCodeInformation() {
  setMapProviderUrls(
      displayedCode.codeArea.latitudeCenter,
      displayedCode.codeArea.longitudeCenter,
      displayedCode.code);
  if (displayedCode.neighbourhood === null) {
    // Code too short, not worth getting an address for it.
    InfoBox.setPanel(
        '<span><p class="message">' + displayedCode.code + '</p></span>');
    return;
  }
  // Get the neighbourhood from the code - we use that to compute the address.
  if (codeAddressCache.has(displayedCode.neighbourhood)) {
    var neighbourhoodInfo = codeAddressCache.get(displayedCode.neighbourhood);
    var shortCode = shortenDisplayedCode(
        displayedCode, neighbourhoodInfo.address, neighbourhoodInfo.lat,
        neighbourhoodInfo.lng);
    if (shortCode != null) {
      InfoBox.setPanel(
          '<span><p class="address">' + shortCode + ' ' +
          neighbourhoodInfo.address + '</p><p class="fullcode">' + code.code +
          '</p></span>');
      return;
    }
  }
  InfoBox.clear();
  if (displayedCode.codeArea.codeLength >= 10) {
    InfoBox.setPanel(
        '<span><p class="areacode">' + displayedCode.area_code + '</p>' +
        '<p class="shortcode">' + displayedCode.place_code + '</p></span>');
  } else if (displayedCode.code != null) {
    InfoBox.setPanel(
        '<span><p class="message">' + displayedCode.code + '</p></span>');
  }
  codePendingGeocoding = displayedCode;
  setTimeout(function() {getAddressForDisplayedCode();}, 2500);
}


/**
 * Get an address for the current displayedCode.
 *
 * If the current displayedCode is more than one second old, use the Google
 * Geocoding API to get an address for that lat/lng, and confirm that the
 * address is close enough to be used to shorten the code. This requires
 * two calls (a reverse geocode, extract address elements, and then geocode
 * that address).
 *
 * We make sure the displayedCode is old, so that we don't send hundreds of
 * geocoding requests as the user is dragging the map.
 *
 * Only call if the displayed code has at least 7 characters (1234+67).
 */
function getAddressForDisplayedCode() {
  if (codePendingGeocoding === null) {
    return;
  }
  if (Date.now() - codePendingGeocoding.timestamp_millis < 1000) {
    return;
  }
  code = codePendingGeocoding;
  codePendingGeocoding = null;
  try {
    var recoveryLocation = getRecoveryLocation();
    // Get an address for the neighbourhood, geocode it, and use the location
    // to shorten the code.
    $.when(
        Geocoder.lookupLatLng(
            code.neighbourhoodArea.latitudeCenter,
            code.neighbourhoodArea.longitudeCenter)
    ).then(
        function(lat, lng, address) {
          return Geocoder.geocodeAddress(
              address, recoveryLocation[0], recoveryLocation[1]);
        },
        function(error) {
          InfoBox.fadeToPanel(
              '<span><p class="areacode">' + displayedCode.area_code + '</p>' +
              '<p class="shortcode">' + displayedCode.place_code + '</p></span>');
        }
    ).then(
        function(address, lat, lng) {
          if (address != '' && lat != null && lng != null) {
            var shortCode = shortenDisplayedCode(code, address, lat, lng);
            if (shortCode != null) {
              InfoBox.fadeToPanel(
                  '<span><p class="address">' + shortCode + ' ' + address +
                  '</p><p class="fullcode">' + code.code + '</p></span>');
            }
          }
        },
        function(error) {
          // If there was an error in the geocodeAddress section, it will be
          // logged there but cause another error here.
          if (typeof error != 'undefined') {
            InfoBox.fadeToPanel(
                '<span><p class="areacode">' + displayedCode.area_code + '</p>' +
                '<p class="shortcode">' + displayedCode.place_code + '</p></span>');
          }
        }
    );
  } catch (e) {
    // This really should not happen.
  }
}

function shortenDisplayedCode(code, address, lat, lng) {
  try {
    var shortCode = OpenLocationCode.shorten(code.code, lat, lng);
    if (shortCode != code.code) {
      // Too much? Keep at least AB+CD.
      if (shortCode.length < code.code.length - 6) {
        shortCode = code.code.substr(6);
      }
      codeAddressCache.put(code.neighbourhood,
          {'address': address, 'lat': lat, 'lng': lng});
      return shortCode;
    }
  } catch (e) {
  }
  return null;
}

/** Display a code location on map and compass. */
function displayCodeMapCompass() {
  return;
  displayingDeviceLocation = false;
  var codeArea = OpenLocationCode.decode(displayedCode);
  map.setCodeMarker(codeArea.latitudeLo, codeArea.longitudeLo,
                    codeArea.latitudeHi, codeArea.longitudeHi);
  // Create artificial bounds that are twice as big as the code.
  // Zooming in is easier than zooming out.
  codeArea = expandCodeArea(codeArea);
  map.zoomToCenter(codeArea.latitudeCenter, codeArea.longitudeLo,
                   codeArea.latitudeHi, codeArea.longitudeHi);
  if (deviceLatLng != null) {
    compass.setPoints(deviceLatLng[0], deviceLatLng[1],
        codeArea.latitudeCenter, codeArea.longitudeCenter);
  } else {
    compass.setPoints(codeArea.latitudeCenter, codeArea.longitudeCenter);
  }
}

/**
 * Get the lat and lng to use to recover a short code.
 * @return {Array<number>} The lat,lng from the current location if known, from
      the map center (if the maps API could load), or (null, null).
 */
function getRecoveryLocation() {
  if (deviceLatLng !== null) {
    return deviceLatLng;
  } else if (map.isReady()) {
    var center = map.map.getCenter();
    return [center.lat(), center.lng()];
  } else {
    return [null, null];
  }
}

/**
 * Load Google Maps asynch so we can work offline.
 *
 * Once the Google Maps API has loaded, it calls googleMapSetup to initialise
 * the map object.
 *
 * In the page javascript, include:
 *   window.online = loadGoogleMaps;
 */
function googleMapLoad() {
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyCP3yO0nubZ8vCiyK-ZF-XEJ7VQWe6wVIM&v=3.exp&';
  if (messages.language !== null) {
    script.src += 'language=' + messages.language + '&';
  }
  script.src += 'callback=googleMapSetup';
  document.body.appendChild(script);
}

/** Used to set up the map object - called once Google Maps has loaded. */
function googleMapSetup() {
  map.initialise();
}

/**
 * Expand an open location code codeArea object.
 */
function expandCodeArea(codeArea) {
  var lngRange = codeArea.longitudeHi - codeArea.longitudeLo;
  var latRange = codeArea.latitudeHi - codeArea.latitudeLo;
  var newArea = {};
  newArea.latitudeLo = codeArea.latitudeLo - latRange;
  newArea.latitudeHi = codeArea.latitudeHi + latRange;
  newArea.longitudeLo = codeArea.longitudeLo - lngRange;
  newArea.longitudeHi = codeArea.longitudeHi + lngRange;
  return newArea;
}

/**
 * Called when the user clicks on the location button.
 *
 * The zoom action is defined by the classes assigned to #location,
 * see updateLocationButton.
 */
function locationZoom() {
  displayedCode.is_pinned = true;
  pushPushPin();
  var button = $('#location');
  if (button.hasClass('code-zoom')) {
    zoomToCode();
  } else {
    var codeCenter = new google.maps.LatLng(
        displayedCode.codeArea.latitudeCenter,
        displayedCode.codeArea.longitudeCenter);
    var bounds = null;
    if (button.hasClass('location-zoom')) {
      bounds = expandCodeArea(displayedCode.codeArea);
      bounds.latitudeLo = deviceLatLng[0] - 0.00001;
      bounds.latitudeHi = deviceLatLng[0] + 0.00001;
      bounds.longitudeLo = deviceLatLng[1] - 0.00001;
      bounds.longitudeHi = deviceLatLng[1] + 0.00001;
    } else {
      bounds = expandCodeArea(displayedCode.codeArea);
      bounds.latitudeLo = Math.min(bounds.latitudeLo, deviceLatLng[0]);
      bounds.latitudeHi = Math.max(bounds.latitudeHi, deviceLatLng[0]);
      bounds.longitudeLo = Math.min(bounds.longitudeLo, deviceLatLng[1]);
      bounds.longitudeHi = Math.max(bounds.longitudeHi, deviceLatLng[1]);
    }
    map.zoomToBounds(bounds.latitudeLo, bounds.longitudeLo,
                     bounds.latitudeHi, bounds.longitudeHi);
  }
}

function isMobile() {
  try {
    document.createEvent('TouchEvent');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check the URL for an initial OLC code.
 *
 * It will return any path component that includes a '+'.
 * Note that this is not necessarily a valid OLC code!
 *
 * @return {string} the code if there was one or null.
 */
function getCodeFromUrl() {
  // TODO: Get the code if passed as a q= argument.
  var basePath = location.pathname;
  var fields = location.pathname.split('/');
  var code = null;
  var query = getUrlParameter('q');
  if (query != null) {
    code = query.toUpperCase();
    code = code.replace('/', '');
  } else if (fields.length > 0) {
    code = fields.pop().toUpperCase();
  }
  if (code == null) {
    return null;
  }
  if (code[8] == '+') {
    return code;
  } else if (code[0] == '+') {
    // Convert from old format OLC codes that used +xxxx.xxxxxx to
    // xxxxxxxx+xx.
    code = code.replace('+', '').replace('.', '');
    code = code.substring(0, 8) + '+' + code.substring(8);
    return code;
  }
  return null;
}

function getUrlParameter(param) {
  var query = window.location.search.substring(1);
  var variables = query.split('&');
  for (var i = 0; i < variables.length; i++) {
    var paramName = variables[i].split('=');
    if (paramName[0] == param) {
      return paramName[1];
    }
  }
}
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/


/**
  Provides an object to interact with an embedded map.
  @this MapController
  @param {object} container The DOM element (a DIV) that contains the map.
 */
function MapController(container) {
  // Flag to indicate that the Maps API is loaded and the map is ready.
  this.tilesLoaded = false;
  // DOM element holding the map.
  this.mapContainer = container;
  // Google Maps API map object.
  this.map;
  // Google Maps API Marker object indicating current device
  // location.
  this.marker;
  this.accuracyMarker;
  // OLC location marker.
  this.codeMarker;
  // Google Maps API Rectangle object indicating the current OLC code area.
  this.codeArea;
  // Flag to indicate that we have not yet drawn the code marker. We may
  // receive location events faster than the map can load, so we need a way to
  // indicate that although we are not at the first location, we need to plot
  // the location as if it was the first time.
  this.codeMarkerDisplayed = false;
}

// ID for the imagery type preference.
MapController._IMAGERY_PREF = 'map_imagery';

// Default center location.
MapController._DEFAULT_CENTER = null;

// Default zoom level.
MapController._DEFAULT_ZOOM = 4;


/**
  Set up the map, register click handlers and get location updates.
  If the Google Maps APIs weren't loaded, returns false.
  @return {boolean} Whether the Maps API was loaded.
 */
MapController.prototype.initialise = function() {
  if (typeof google == 'undefined' || typeof google.maps == 'undefined') {
    return false;
  }

  // Default center location.
  MapController._DEFAULT_CENTER = new google.maps.LatLng(40, 15);

  // Default location.
  // Create the map object.
  this.map = new google.maps.Map(
      this.mapContainer,
      {
        center: MapController._DEFAULT_CENTER,
        zoom: MapController._DEFAULT_ZOOM,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        scaleControl: true,
        zoomControl: true,
        disableDefaultUI: true
      });
  this.map.setTilt(0);

  // Create the markers in the order to draw them.
  this.accuracyMarker = new google.maps.Circle({
      map: this.map,
      clickable: false
  });
  this.marker = new google.maps.Circle({
      map: this.map,
      clickable: false
  });
  this.codeArea = new google.maps.Polygon({
      map: this.map,
      clickable: false,
      geodesic: true
  });
  this.codeMarker = new google.maps.Circle({
      map: this.map,
      clickable: false
  });
  var imageryPref = DataStore.get(MapController._IMAGERY_PREF);
  if (imageryPref != null) {
    this.map.setMapTypeId(imageryPref);
  }

  google.maps.event.addListener(this.map, 'zoom_changed', receiveMapZoomEvent);
  google.maps.event.addListener(this.map, 'tilesloaded', receiveTilesLoadedEvent);
  google.maps.event.addListener(this.map, 'click', receiveMapClickEvent);
  google.maps.event.addListener(this.map, 'bounds_changed',
      receiveMapBoundsEvent);
  google.maps.event.addListener(this.map, 'dragstart', function() {
      if (displayedCode.is_pinned) {
        return;
      }
      var map = $('.map-area');
      var center = $('<div>').addClass('map-center');
      $('.map-area').append(center);
      center.css('top',
          (map.outerHeight() / 2 - center.outerHeight() / 2) + 'px');
      center.css('left',
          (map.outerWidth() / 2 - center.outerWidth() / 2) + 'px');
      center.fadeIn();
  });
  google.maps.event.addListener(this.map, 'dragend', function() {
      $('.map-area .map-center').fadeOut();
  });

  if (displayedCode.code != null) {
    // We already have a code to display - probably from the URL -
    // so zoom to it and draw it.
    map.setCodeMarker(
        displayedCode.codeArea.latitudeLo,
        displayedCode.codeArea.longitudeLo,
        displayedCode.codeArea.latitudeHi,
        displayedCode.codeArea.longitudeHi);
    // Zooming in is easier than zooming out.
    zoomToCode();
  }
  return true;
};


/** @return {boolean} whether the map has been initialised. */
MapController.prototype.isReady = function() {
  return typeof this.map != 'undefined' && this.tilesLoaded;
};


/**
  Toggle imagery between satellite and roadmap.
 */
MapController.prototype.toggleImagery = function() {
  if (typeof google == 'undefined' || typeof google.maps == 'undefined') {
    return;
  }
  if (this.map.getMapTypeId() === google.maps.MapTypeId.ROADMAP) {
    this.map.setMapTypeId(google.maps.MapTypeId.HYBRID);
  } else {
    this.map.setMapTypeId(google.maps.MapTypeId.ROADMAP);
  }
  // Save it in the data store.
  DataStore.putString(MapController._IMAGERY_PREF, this.map.getMapTypeId());
};


/**
  Get a new location for the current position marker.
  @param {number} lat The latitude.
  @param {number} lng The longitude.
 */
MapController.prototype.setLocationMarker = function(lat, lng, accuracy) {
  if (typeof google == 'undefined' || typeof google.maps == 'undefined') {
    return;
  }
  this.currentLatLng = [lat, lng];
  var latLng = new google.maps.LatLng(lat, lng);
  var zoom = this.map.getZoom();
  var size = 1.5 * Math.pow(2, Math.max(0, 20 - zoom));
  this.marker.setOptions({
      center: latLng,
      radius: size,
      strokeColor: '#02567f',
      strokeOpacity: 1.0,
      strokeWeight: 1,
      fillColor: '#039be5',
      fillOpacity: 1.0
  });

  if (typeof accuracy != 'undefined') {
    this.accuracyMarker.setOptions({
        center: latLng,
        radius: accuracy,
        strokeColor: '#039be5',
        strokeOpacity: 0.3,
        strokeWeight: 1,
        fillColor: '#039be5',
        fillOpacity: 0.1
    });
  }
};

MapController.prototype.redrawLocationMarker = function() {
  if (this.marker === null || typeof this.marker.getCenter() === 'undefined') {
    return;
  }
  this.setLocationMarker(
      this.marker.getCenter().lat(), this.marker.getCenter().lng());
};


/**
  Display the marker for a code on the map.
  It could be a rectangle, or if the rectangle would be too small, a constant
  sized circle is drawn (depending on the zoom level).
 */
MapController.prototype.setCodeMarker = function(latLo, lngLo, latHi, lngHi) {
  if (typeof google == 'undefined' || typeof google.maps == 'undefined' || !this.isReady()) {
    return;
  }
  this.codeMarkerDisplayed = true;
  var zoom = this.map.getZoom();
  var size = 1.5 * Math.pow(2, Math.max(0, 20 - zoom));
  if (size > MapController._earthDistance(latLo, lngLo, latHi, lngHi)) {
    var center = new google.maps.LatLng(
        (latLo + latHi) / 2, (lngLo + lngHi) / 2);
    this.codeArea.setMap(null);
    this.codeMarker.setOptions({
        map: this.map,
        center: center,
        radius: size,
        strokeColor: '#e11e60',
        strokeOpacity: 1.0,
        strokeWeight: 2,
        fillColor: '#f06292',
        fillOpacity: 1.0,
    });
  } else {
    var path = Array();
    path.push(new google.maps.LatLng(latLo, lngLo));
    path.push(new google.maps.LatLng(latLo, lngHi));
    path.push(new google.maps.LatLng(latHi, lngHi));
    path.push(new google.maps.LatLng(latHi, lngLo));

    this.codeMarker.setMap(null);
    this.codeArea.setOptions({
        map: this.map,
        path: path,
        strokeColor: '#e11e60',
        strokeOpacity: 1.0,
        strokeWeight: 1,
        fillColor: '#f06292',
        fillOpacity: 0.3
    });
  }
};


/** Indicates whether we have drawn the code marker yet. */
MapController.prototype.isCodeMarkerDisplayed = function() {
  return this.codeMarkerDisplayed;
};


/**
  Pans and zooms the map if the entire code is not visible or
  if the zoom level is too low to allow codes to be seen easily.
 */
MapController.prototype.zoomToBounds = function(
    latLo, lngLo, latHi, lngHi, userLat, userLng) {
  if (typeof google == 'undefined' || typeof google.maps == 'undefined') {
    return;
  }
  var sw = new google.maps.LatLng(latLo, lngLo);
  var ne = new google.maps.LatLng(latHi, lngHi);
  var bounds = new google.maps.LatLngBounds(sw, ne);
  if (userLat != null && userLng != null) {
    bounds.extend(new google.maps.LatLng(userLat, userLng));
  }
  this.map.fitBounds(bounds);
};


/**
  Moves the center of the map and sets the zoom level.
 */
MapController.prototype.zoomToCenter = function(lat, lng, zoom) {
  if (typeof google == 'undefined' || typeof google.maps == 'undefined') {
    return;
  }
  this.map.setCenter(new google.maps.LatLng(lat, lng));
  try {
    // This needs to be wrapped in case the map isn't ready. It will throw
    // an exception but will display the correct zoom once the tiles are loaded.
    this.map.setZoom(zoom);
  } catch (e) {
    //
  }
};

/**
  Compute distance between two locations.
  @param {number} lat1 The latitude of the first location.
  @param {number} lng1 The longitude of the first location.
  @param {number} lat2 The latitude of the second location.
  @param {number} lng2 The longitude of the second location.
  @return {number} The distance between locations in meters.
 */
MapController._earthDistance = function(lat1, lng1, lat2, lng2) {
  var toRadians = Math.PI / 180;
  // Earth radius in meters
  var radius = 6371000;
  var lat1Rad = lat1 * toRadians;
  var lng1Rad = lng1 * toRadians;
  var lat2Rad = lat2 * toRadians;
  var lng2Rad = lng2 * toRadians;
  var latDiff = lat2Rad - lat1Rad;
  var lngDiff = lng2Rad - lng1Rad;

  var a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
          Math.cos(lat1Rad) * Math.cos(lat2Rad) *
          Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * radius;
};

/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 * Get strings depending on the browser language setting.
 *
 * This has all the messages for the UI defined. Each message is defined for
 * all the languages, keeping all the definitions together. This is in contrast
 * to other localisation methods that have separate files per language. We need
 * to load everything, so that it's cached, so there's no benefit in splitting
 * the messages across multiple files. Having all local versions of a message
 * next to each other makes it easier to notice when messages change.
 *
 * @this Messages
 */
// Global var that holds all the messages for all the languages.
LocalisedMessages = {};
function Messages() {
  // Default language.
  this.language = 'en';

  // Work out which of our supported languages we'll use. If we have a stored
  // preference, use that, otherwise use the preferred language list for the
  // browser, or use the browser language settings.
  if (DataStore.has(Messages.LANGUAGE_PREF)) {
    this.language = DataStore.get(Messages.LANGUAGE_PREF);
  } else if ('languages' in navigator) {
    // If we have a preferred language list for the browser.
    for (var i = 0; i < navigator.languages.length; i++) {
      if (navigator.languages[i] in LocalisedMessages) {
        this.language = navigator.languages[i];
        break;
      }
      var lang = navigator.languages[i].substr(0, 2);
      if (lang in LocalisedMessages) {
        this.language = lang;
        break;
      }
    }
  } else {
    // Use the browser language setting.
    var language = navigator.language || navigator.userLanguage;
    if (language in LocalisedMessages) {
      // We have an entry for the browser language.
      this.language = language;
    } else if (language.substr(0, 2) in LocalisedMessages) {
      // Try just the first two characters of the browser language.
      this.language = language.substr(0, 2);
    }
  }
}

// Datastore tag.
Messages.LANGUAGE_PREF = 'language_pref';

/** Set the language. */
Messages.prototype.setLanguage = function(language) {
  if (language in LocalisedMessages) {
    this.language = language;
    DataStore.putString(Messages.LANGUAGE_PREF, language);
    return true;
  }
  return false;
};

/**
  Get the message for the passed key in the current language. If it doesn't
  exist, returns null.
  @param {string} key The message key to fetch.
  @param {Array<string>} params A dict of name/value pairs to try to substitute
      into the message text.
  @return {string} the message or null if the message key doesn't exist.
 */
Messages.prototype.get = function(key, params) {
  var message = this.getWithLanguage(this.language, key, params);
  if (message !== null) {
    return message;
  }
  if (this.language != "en") {
    // Fallback to English.
    return this.getWithLanguage('en', key, params);
  }
  return null;
};

/**
  Get the message for the passed key in the specified language. If it doesn't
  exist, returns the message in English, or null if it doesn't exist.
  @param {string} key The message key to fetch.
  @param {Array<string>} params A dict of name/value pairs to try to substitute
      into the message text.
  @return {string} the message or null if the message key doesn't exist.
 */
Messages.prototype.getWithLanguage = function(language, key, params) {
  if (language in LocalisedMessages && key in LocalisedMessages[language]) {
    var message = LocalisedMessages[language][key]["message"];
    // Are there default placeholders?
    if ("placeholders" in LocalisedMessages[language][key]) {
      var placeholders = LocalisedMessages[language][key]["placeholders"];
      for (var placeholder in placeholders) {
        var regex = new RegExp("\\$" + placeholder + "\\$", 'g');
        var content = placeholders[placeholder]["content"];
        message = message.replace(regex, content);
      }
    }
    // Substitute in the passed params into the placeholders.
    for (var param in params) {
      var regex = new RegExp("\\$" + param + "\\$", 'g');
      message = message.replace(regex, params[param]);
    }
    return message;
  }
  return null;
};
// Copyright 2014 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
  Convert locations to and from short codes.

  Open Location Codes are short, 10-11 character codes that can be used instead
  of street addresses. The codes can be generated and decoded offline, and use
  a reduced character set that minimises the chance of codes including words.

  Codes are able to be shortened relative to a nearby location. This means that
  in many cases, only four to seven characters of the code are needed.
  To recover the original code, the same location is not required, as long as
  a nearby location is provided.

  Codes represent rectangular areas rather than points, and the longer the
  code, the smaller the area. A 10 character code represents a 13.5x13.5
  meter area (at the equator. An 11 character code represents approximately
  a 2.8x3.5 meter area.

  Two encoding algorithms are used. The first 10 characters are pairs of
  characters, one for latitude and one for latitude, using base 20. Each pair
  reduces the area of the code by a factor of 400. Only even code lengths are
  sensible, since an odd-numbered length would have sides in a ratio of 20:1.

  At position 11, the algorithm changes so that each character selects one
  position from a 4x5 grid. This allows single-character refinements.

  Examples:

    Encode a location, default accuracy:
    var code = OpenLocationCode.encode(47.365590, 8.524997);

    Encode a location using one stage of additional refinement:
    var code = OpenLocationCode.encode(47.365590, 8.524997, 11);

    Decode a full code:
    var coord = OpenLocationCode.decode(code);
    var msg = 'Center is ' + coord.latitudeCenter + ',' + coord.longitudeCenter;

    Attempt to trim the first characters from a code:
    var shortCode = OpenLocationCode.shorten('8FVC9G8F+6X', 47.5, 8.5);

    Recover the full code from a short code:
    var code = OpenLocationCode.recoverNearest('9G8F+6X', 47.4, 8.6);
    var code = OpenLocationCode.recoverNearest('8F+6X', 47.4, 8.6);
 */
(function(window) {
  var OpenLocationCode = window.OpenLocationCode = {};

  // A separator used to break the code into two parts to aid memorability.
  var SEPARATOR_ = '+';

  // The number of characters to place before the separator.
  var SEPARATOR_POSITION_ = 8;

  // The character used to pad codes.
  var PADDING_CHARACTER_ = '0';

  // The character set used to encode the values.
  var CODE_ALPHABET_ = '23456789CFGHJMPQRVWX';

  // The base to use to convert numbers to/from.
  var ENCODING_BASE_ = CODE_ALPHABET_.length;

  // The maximum value for latitude in degrees.
  var LATITUDE_MAX_ = 90;

  // The maximum value for longitude in degrees.
  var LONGITUDE_MAX_ = 180;

  // Maxiumum code length using lat/lng pair encoding. The area of such a
  // code is approximately 13x13 meters (at the equator), and should be suitable
  // for identifying buildings. This excludes prefix and separator characters.
  var PAIR_CODE_LENGTH_ = 10;

  // The resolution values in degrees for each position in the lat/lng pair
  // encoding. These give the place value of each position, and therefore the
  // dimensions of the resulting area.
  var PAIR_RESOLUTIONS_ = [20.0, 1.0, .05, .0025, .000125];

  // Number of columns in the grid refinement method.
  var GRID_COLUMNS_ = 4;

  // Number of rows in the grid refinement method.
  var GRID_ROWS_ = 5;

  // Size of the initial grid in degrees.
  var GRID_SIZE_DEGREES_ = 0.000125;

  // Minimum length of a code that can be shortened.
  var MIN_TRIMMABLE_CODE_LEN_ = 6;

  /**
    Returns the OLC alphabet.
   */
  var getAlphabet = OpenLocationCode.getAlphabet = function() {
    return CODE_ALPHABET_;
  };

  /**
    Determines if a code is valid.

    To be valid, all characters must be from the Open Location Code character
    set with at most one separator. The separator can be in any even-numbered
    position up to the eighth digit.
   */
  var isValid = OpenLocationCode.isValid = function(code) {
    if (!code) {
      return false;
    }
    // The separator is required.
    if (code.indexOf(SEPARATOR_) == -1) {
      return false;
    }
    if (code.indexOf(SEPARATOR_) != code.lastIndexOf(SEPARATOR_)) {
      return false;
    }
    // Is it in an illegal position?
    if (code.indexOf(SEPARATOR_) > SEPARATOR_POSITION_ ||
        code.indexOf(SEPARATOR_) % 2 == 1) {
      return false;
    }
    // We can have an even number of padding characters before the separator,
    // but then it must be the final character.
    if (code.indexOf(PADDING_CHARACTER_) > -1) {
      // Not allowed to start with them!
      if (code.indexOf(PADDING_CHARACTER_) == 0) {
        return false;
      }
      // There can only be one group and it must have even length.
      var padMatch = code.match(new RegExp('(' + PADDING_CHARACTER_ + '+)', 'g'));
      if (padMatch.length > 1 || padMatch[0].length % 2 == 1 ||
          padMatch[0].length > SEPARATOR_POSITION_ - 2) {
        return false;
      }
      // If the code is long enough to end with a separator, make sure it does.
      if (code.charAt(code.length - 1) != SEPARATOR_) {
        return false;
      }
    }
    // If there are characters after the separator, make sure there isn't just
    // one of them (not legal).
    if (code.length - code.indexOf(SEPARATOR_) - 1 == 1) {
      return false;
    }

    // Strip the separator and any padding characters.
    code = code.replace(new RegExp('\\' + SEPARATOR_ + '+'), '')
        .replace(new RegExp(PADDING_CHARACTER_ + '+'), '');
    // Check the code contains only valid characters.
    for (var i = 0, len = code.length; i < len; i++) {
      var character = code.charAt(i).toUpperCase();
      if (character != SEPARATOR_ && CODE_ALPHABET_.indexOf(character) == -1) {
        return false;
      }
    }
    return true;
  };

  /**
    Determines if a code is a valid short code.

    A short Open Location Code is a sequence created by removing four or more
    digits from an Open Location Code. It must include a separator
    character.
   */
  var isShort = OpenLocationCode.isShort = function(code) {
    // Check it's valid.
    if (!isValid(code)) {
      return false;
    }
    // If there are less characters than expected before the SEPARATOR.
    if (code.indexOf(SEPARATOR_) >= 0 &&
        code.indexOf(SEPARATOR_) < SEPARATOR_POSITION_) {
      return true;
    }
    return false;
  };

  /**
    Determines if a code is a valid full Open Location Code.

    Not all possible combinations of Open Location Code characters decode to
    valid latitude and longitude values. This checks that a code is valid
    and also that the latitude and longitude values are legal. If the prefix
    character is present, it must be the first character. If the separator
    character is present, it must be after four characters.
   */
  var isFull = OpenLocationCode.isFull = function(code) {
    if (!isValid(code)) {
      return false;
    }
    // If it's short, it's not full.
    if (isShort(code)) {
      return false;
    }

    // Work out what the first latitude character indicates for latitude.
    var firstLatValue = CODE_ALPHABET_.indexOf(
        code.charAt(0).toUpperCase()) * ENCODING_BASE_;
    if (firstLatValue >= LATITUDE_MAX_ * 2) {
      // The code would decode to a latitude of >= 90 degrees.
      return false;
    }
    if (code.length > 1) {
      // Work out what the first longitude character indicates for longitude.
      var firstLngValue = CODE_ALPHABET_.indexOf(
          code.charAt(1).toUpperCase()) * ENCODING_BASE_;
      if (firstLngValue >= LONGITUDE_MAX_ * 2) {
        // The code would decode to a longitude of >= 180 degrees.
        return false;
      }
    }
    return true;
  };

  /**
    Encode a location into an Open Location Code.

    Produces a code of the specified length, or the default length if no length
    is provided.

    The length determines the accuracy of the code. The default length is
    10 characters, returning a code of approximately 13.5x13.5 meters. Longer
    codes represent smaller areas, but lengths > 14 are sub-centimetre and so
    11 or 12 are probably the limit of useful codes.

    Args:
      latitude: A latitude in signed decimal degrees. Will be clipped to the
          range -90 to 90.
      longitude: A longitude in signed decimal degrees. Will be normalised to
          the range -180 to 180.
      codeLength: The number of significant digits in the output code, not
          including any separator characters.
   */
  var encode = OpenLocationCode.encode = function(latitude,
      longitude, codeLength) {
    if (typeof codeLength == 'undefined') {
      codeLength = PAIR_CODE_LENGTH_;
    }
    if (codeLength < 2 ||
        (codeLength < SEPARATOR_POSITION_ && codeLength % 2 == 1)) {
      throw 'IllegalArgumentException: Invalid Open Location Code length';
    }
    // Ensure that latitude and longitude are valid.
    latitude = clipLatitude(latitude);
    longitude = normalizeLongitude(longitude);
    // Latitude 90 needs to be adjusted to be just less, so the returned code
    // can also be decoded.
    if (latitude == 90) {
      latitude = latitude - computeLatitudePrecision(codeLength);
    }
    var code = encodePairs(
        latitude, longitude, Math.min(codeLength, PAIR_CODE_LENGTH_));
    // If the requested length indicates we want grid refined codes.
    if (codeLength > PAIR_CODE_LENGTH_) {
      code += encodeGrid(
          latitude, longitude, codeLength - PAIR_CODE_LENGTH_);
    }
    return code;
  };

  /**
    Decodes an Open Location Code into the location coordinates.

    Returns a CodeArea object that includes the coordinates of the bounding
    box - the lower left, center and upper right.

    Args:
      code: The Open Location Code to decode.

    Returns:
      A CodeArea object that provides the latitude and longitude of two of the
      corners of the area, the center, and the length of the original code.
   */
  var decode = OpenLocationCode.decode = function(code) {
    if (!isFull(code)) {
      throw ('IllegalArgumentException: ' +
          'Passed Open Location Code is not a valid full code: ' + code);
    }
    // Strip out separator character (we've already established the code is
    // valid so the maximum is one), padding characters and convert to upper
    // case.
    code = code.replace(SEPARATOR_, '');
    code = code.replace(new RegExp(PADDING_CHARACTER_ + '+'), '');
    code = code.toUpperCase();
    // Decode the lat/lng pair component.
    var codeArea = decodePairs(code.substring(0, PAIR_CODE_LENGTH_));
    // If there is a grid refinement component, decode that.
    if (code.length <= PAIR_CODE_LENGTH_) {
      return codeArea;
    }
    var gridArea = decodeGrid(code.substring(PAIR_CODE_LENGTH_));
    return CodeArea(
      codeArea.latitudeLo + gridArea.latitudeLo,
      codeArea.longitudeLo + gridArea.longitudeLo,
      codeArea.latitudeLo + gridArea.latitudeHi,
      codeArea.longitudeLo + gridArea.longitudeHi,
      codeArea.codeLength + gridArea.codeLength);
  };

  /**
    Recover the nearest matching code to a specified location.

    Given a short Open Location Code of between four and seven characters,
    this recovers the nearest matching full code to the specified location.

    The number of characters that will be prepended to the short code, depends
    on the length of the short code and whether it starts with the separator.

    If it starts with the separator, four characters will be prepended. If it
    does not, the characters that will be prepended to the short code, where S
    is the supplied short code and R are the computed characters, are as
    follows:
    SSSS    -> RRRR.RRSSSS
    SSSSS   -> RRRR.RRSSSSS
    SSSSSS  -> RRRR.SSSSSS
    SSSSSSS -> RRRR.SSSSSSS
    Note that short codes with an odd number of characters will have their
    last character decoded using the grid refinement algorithm.

    Args:
      shortCode: A valid short OLC character sequence.
      referenceLatitude: The latitude (in signed decimal degrees) to use to
          find the nearest matching full code.
      referenceLongitude: The longitude (in signed decimal degrees) to use
          to find the nearest matching full code.

    Returns:
      The nearest full Open Location Code to the reference location that matches
      the short code. Note that the returned code may not have the same
      computed characters as the reference location. This is because it returns
      the nearest match, not necessarily the match within the same cell. If the
      passed code was not a valid short code, but was a valid full code, it is
      returned unchanged.
   */
  var recoverNearest = OpenLocationCode.recoverNearest = function(
      shortCode, referenceLatitude, referenceLongitude) {
    if (!isShort(shortCode)) {
      if (isFull(shortCode)) {
        return shortCode;
      } else {
        throw 'ValueError: Passed short code is not valid: ' + shortCode;
      }
    }
    // Ensure that latitude and longitude are valid.
    referenceLatitude = clipLatitude(referenceLatitude);
    referenceLongitude = normalizeLongitude(referenceLongitude);

    // Clean up the passed code.
    shortCode = shortCode.toUpperCase();
    // Compute the number of digits we need to recover.
    var paddingLength = SEPARATOR_POSITION_ - shortCode.indexOf(SEPARATOR_);
    // The resolution (height and width) of the padded area in degrees.
    var resolution = Math.pow(20, 2 - (paddingLength / 2));
    // Distance from the center to an edge (in degrees).
    var areaToEdge = resolution / 2.0;

    // Now round down the reference latitude and longitude to the resolution.
    var roundedLatitude = Math.floor(referenceLatitude / resolution) *
        resolution;
    var roundedLongitude = Math.floor(referenceLongitude / resolution) *
        resolution;

    // Use the reference location to pad the supplied short code and decode it.
    var codeArea = decode(
        encode(roundedLatitude, roundedLongitude).substr(0, paddingLength)
        + shortCode);
    // How many degrees latitude is the code from the reference? If it is more
    // than half the resolution, we need to move it east or west.
    var degreesDifference = codeArea.latitudeCenter - referenceLatitude;
    if (degreesDifference > areaToEdge) {
      // If the center of the short code is more than half a cell east,
      // then the best match will be one position west.
      codeArea.latitudeCenter -= resolution;
    } else if (degreesDifference < -areaToEdge) {
      // If the center of the short code is more than half a cell west,
      // then the best match will be one position east.
      codeArea.latitudeCenter += resolution;
    }

    // How many degrees longitude is the code from the reference?
    degreesDifference = codeArea.longitudeCenter - referenceLongitude;
    if (degreesDifference > areaToEdge) {
      codeArea.longitudeCenter -= resolution;
    } else if (degreesDifference < -areaToEdge) {
      codeArea.longitudeCenter += resolution;
    }

    return encode(
        codeArea.latitudeCenter, codeArea.longitudeCenter, codeArea.codeLength);
  };

  /**
    Remove characters from the start of an OLC code.

    This uses a reference location to determine how many initial characters
    can be removed from the OLC code. The number of characters that can be
    removed depends on the distance between the code center and the reference
    location.

    The minimum number of characters that will be removed is four. If more than
    four characters can be removed, the additional characters will be replaced
    with the padding character. At most eight characters will be removed.

    The reference location must be within 50% of the maximum range. This ensures
    that the shortened code will be able to be recovered using slightly different
    locations.

    Args:
      code: A full, valid code to shorten.
      latitude: A latitude, in signed decimal degrees, to use as the reference
          point.
      longitude: A longitude, in signed decimal degrees, to use as the reference
          point.

    Returns:
      Either the original code, if the reference location was not close enough,
      or the .
   */
  var shorten = OpenLocationCode.shorten = function(
      code, latitude, longitude) {
    if (!isFull(code)) {
      throw 'ValueError: Passed code is not valid and full: ' + code;
    }
    if (code.indexOf(PADDING_CHARACTER_) != -1) {
      throw 'ValueError: Cannot shorten padded codes: ' + code;
    }
    var code = code.toUpperCase();
    var codeArea = decode(code);
    if (codeArea.codeLength < MIN_TRIMMABLE_CODE_LEN_) {
      throw 'ValueError: Code length must be at least ' +
          MIN_TRIMMABLE_CODE_LEN_;
    }
    // Ensure that latitude and longitude are valid.
    latitude = clipLatitude(latitude);
    longitude = normalizeLongitude(longitude);
    // How close are the latitude and longitude to the code center.
    var range = Math.max(
        Math.abs(codeArea.latitudeCenter - latitude),
        Math.abs(codeArea.longitudeCenter - longitude));
    for (var i = PAIR_RESOLUTIONS_.length - 2; i >= 1; i--) {
      // Check if we're close enough to shorten. The range must be less than 1/2
      // the resolution to shorten at all, and we want to allow some safety, so
      // use 0.3 instead of 0.5 as a multiplier.
      if (range < (PAIR_RESOLUTIONS_[i] * 0.3)) {
        // Trim it.
        return code.substring((i + 1) * 2);
      }
    }
    return code;
  };

  /**
    Clip a latitude into the range -90 to 90.

    Args:
      latitude: A latitude in signed decimal degrees.
   */
  var clipLatitude = function(latitude) {
    return Math.min(90, Math.max(-90, latitude));
  };

  /**
    Compute the latitude precision value for a given code length. Lengths <=
    10 have the same precision for latitude and longitude, but lengths > 10
    have different precisions due to the grid method having fewer columns than
    rows.
   */
  var computeLatitudePrecision = function(codeLength) {
    if (codeLength <= 10) {
      return Math.pow(20, Math.floor(codeLength / -2 + 2));
    }
    return Math.pow(20, -3) / Math.pow(GRID_ROWS_, codeLength - 10);
  };

  /**
    Normalize a longitude into the range -180 to 180, not including 180.

    Args:
      longitude: A longitude in signed decimal degrees.
   */
  var normalizeLongitude = function(longitude) {
    while (longitude < -180) {
      longitude = longitude + 360;
    }
    while (longitude >= 180) {
      longitude = longitude - 360;
    }
    return longitude;
  };

  /**
    Encode a location into a sequence of OLC lat/lng pairs.

    This uses pairs of characters (longitude and latitude in that order) to
    represent each step in a 20x20 grid. Each code, therefore, has 1/400th
    the area of the previous code.

    Args:
      latitude: A latitude in signed decimal degrees.
      longitude: A longitude in signed decimal degrees.
      codeLength: The number of significant digits in the output code, not
          including any separator characters.
   */
  var encodePairs = function(latitude, longitude, codeLength) {
    var code = '';
    // Adjust latitude and longitude so they fall into positive ranges.
    var adjustedLatitude = latitude + LATITUDE_MAX_;
    var adjustedLongitude = longitude + LONGITUDE_MAX_;
    // Count digits - can't use string length because it may include a separator
    // character.
    var digitCount = 0;
    while (digitCount < codeLength) {
      // Provides the value of digits in this place in decimal degrees.
      var placeValue = PAIR_RESOLUTIONS_[Math.floor(digitCount / 2)];
      // Do the latitude - gets the digit for this place and subtracts that for
      // the next digit.
      var digitValue = Math.floor(adjustedLatitude / placeValue);
      adjustedLatitude -= digitValue * placeValue;
      code += CODE_ALPHABET_.charAt(digitValue);
      digitCount += 1;
      // And do the longitude - gets the digit for this place and subtracts that
      // for the next digit.
      digitValue = Math.floor(adjustedLongitude / placeValue);
      adjustedLongitude -= digitValue * placeValue;
      code += CODE_ALPHABET_.charAt(digitValue);
      digitCount += 1;
      // Should we add a separator here?
      if (digitCount == SEPARATOR_POSITION_ && digitCount < codeLength) {
        code += SEPARATOR_;
      }
    }
    if (code.length < SEPARATOR_POSITION_) {
      code = code + Array(SEPARATOR_POSITION_ - code.length + 1).join(PADDING_CHARACTER_);
    }
    if (code.length == SEPARATOR_POSITION_) {
      code = code + SEPARATOR_;
    }
    return code;
  };

  /**
    Encode a location using the grid refinement method into an OLC string.

    The grid refinement method divides the area into a grid of 4x5, and uses a
    single character to refine the area. This allows default accuracy OLC codes
    to be refined with just a single character.

    Args:
      latitude: A latitude in signed decimal degrees.
      longitude: A longitude in signed decimal degrees.
      codeLength: The number of characters required.
   */
  var encodeGrid = function(latitude, longitude, codeLength) {
    var code = '';
    var latPlaceValue = GRID_SIZE_DEGREES_;
    var lngPlaceValue = GRID_SIZE_DEGREES_;
    // Adjust latitude and longitude so they fall into positive ranges and
    // get the offset for the required places.
    var adjustedLatitude = (latitude + LATITUDE_MAX_) % latPlaceValue;
    var adjustedLongitude = (longitude + LONGITUDE_MAX_) % lngPlaceValue;
    for (var i = 0; i < codeLength; i++) {
      // Work out the row and column.
      var row = Math.floor(adjustedLatitude / (latPlaceValue / GRID_ROWS_));
      var col = Math.floor(adjustedLongitude / (lngPlaceValue / GRID_COLUMNS_));
      latPlaceValue /= GRID_ROWS_;
      lngPlaceValue /= GRID_COLUMNS_;
      adjustedLatitude -= row * latPlaceValue;
      adjustedLongitude -= col * lngPlaceValue;
      code += CODE_ALPHABET_.charAt(row * GRID_COLUMNS_ + col);
    }
    return code;
  };

  /**
    Decode an OLC code made up of lat/lng pairs.

    This decodes an OLC code made up of alternating latitude and longitude
    characters, encoded using base 20.

    Args:
      code: A valid OLC code, presumed to be full, but with the separator
      removed.
   */
  var decodePairs = function(code) {
    // Get the latitude and longitude values. These will need correcting from
    // positive ranges.
    var latitude = decodePairsSequence(code, 0);
    var longitude = decodePairsSequence(code, 1);
    // Correct the values and set them into the CodeArea object.
    return new CodeArea(
        latitude[0] - LATITUDE_MAX_,
        longitude[0] - LONGITUDE_MAX_,
        latitude[1] - LATITUDE_MAX_,
        longitude[1] - LONGITUDE_MAX_,
        code.length);
  };

  /**
    Decode either a latitude or longitude sequence.

    This decodes the latitude or longitude sequence of a lat/lng pair encoding.
    Starting at the character at position offset, every second character is
    decoded and the value returned.

    Args:
      code: A valid OLC code, presumed to be full, with the separator removed.
      offset: The character to start from.

    Returns:
      A pair of the low and high values. The low value comes from decoding the
      characters. The high value is the low value plus the resolution of the
      last position. Both values are offset into positive ranges and will need
      to be corrected before use.
   */
  var decodePairsSequence = function(code, offset) {
    var i = 0;
    var value = 0;
    while (i * 2 + offset < code.length) {
      value += CODE_ALPHABET_.indexOf(code.charAt(i * 2 + offset)) *
          PAIR_RESOLUTIONS_[i];
      i += 1;
    }
    return [value, value + PAIR_RESOLUTIONS_[i - 1]];
  };

  /**
    Decode the grid refinement portion of an OLC code.

    This decodes an OLC code using the grid refinement method.

    Args:
      code: A valid OLC code sequence that is only the grid refinement
          portion. This is the portion of a code starting at position 11.
   */
  var decodeGrid = function(code) {
    var latitudeLo = 0.0;
    var longitudeLo = 0.0;
    var latPlaceValue = GRID_SIZE_DEGREES_;
    var lngPlaceValue = GRID_SIZE_DEGREES_;
    var i = 0;
    while (i < code.length) {
      var codeIndex = CODE_ALPHABET_.indexOf(code.charAt(i));
      var row = Math.floor(codeIndex / GRID_COLUMNS_);
      var col = codeIndex % GRID_COLUMNS_;

      latPlaceValue /= GRID_ROWS_;
      lngPlaceValue /= GRID_COLUMNS_;

      latitudeLo += row * latPlaceValue;
      longitudeLo += col * lngPlaceValue;
      i += 1;
    }
    return CodeArea(
        latitudeLo, longitudeLo, latitudeLo + latPlaceValue,
        longitudeLo + lngPlaceValue, code.length);
  };

  /**
    Coordinates of a decoded Open Location Code.

    The coordinates include the latitude and longitude of the lower left and
    upper right corners and the center of the bounding box for the area the
    code represents.

    Attributes:
      latitude_lo: The latitude of the SW corner in degrees.
      longitude_lo: The longitude of the SW corner in degrees.
      latitude_hi: The latitude of the NE corner in degrees.
      longitude_hi: The longitude of the NE corner in degrees.
      latitude_center: The latitude of the center in degrees.
      longitude_center: The longitude of the center in degrees.
      code_length: The number of significant characters that were in the code.
          This excludes the separator.
   */
  var CodeArea = OpenLocationCode.CodeArea = function(
    latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength) {
    return new OpenLocationCode.CodeArea.fn.init(
        latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength);
  };
  CodeArea.fn = CodeArea.prototype = {
    init: function(
        latitudeLo, longitudeLo, latitudeHi, longitudeHi, codeLength) {
      this.latitudeLo = latitudeLo;
      this.longitudeLo = longitudeLo;
      this.latitudeHi = latitudeHi;
      this.longitudeHi = longitudeHi;
      this.codeLength = codeLength;
      this.latitudeCenter = Math.min(
          latitudeLo + (latitudeHi - latitudeLo) / 2, LATITUDE_MAX_);
      this.longitudeCenter = Math.min(
          longitudeLo + (longitudeHi - longitudeLo) / 2, LONGITUDE_MAX_);
    }
  };
  CodeArea.fn.init.prototype = CodeArea.fn;
})(window || this);



/**
  Basic cache to store addresses from the geocoder to try to reduce the
  lookup frequency.
  @this SimpleCache
 */
function SimpleCache() {
  this.cache = {};
}

/**
  Check if a key exists in the cache.
  @param {string} key The key to check.
  @return {boolean} True if the key exists, otherwise false.
 */
SimpleCache.prototype.has = function(key) {
  return key in this.cache;
};


/**
  Get the value for a key.
  @param {string} key The key to retrieve.
  @return {*} The value or null if the key isn't present.
 */
SimpleCache.prototype.get = function(key) {
  return this.cache[key];
};


/**
  Put a key and value pair into the cache.
  @param {string} key The key.
  @param {*} value The value to place into the cache.
 */
SimpleCache.prototype.put = function(key, value) {
  this.cache[key] = value;
};
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/** Functions for working with the UI elements. */

/** Class with objects for the main UI elements. */
function UiElements() {
  this.appbarElement = $('.app-bar');
  this.darkbgElement = $('.navdrawer-bg');
  this.mainMenuContainer = $('#main-menu');
  this.languageContainer = $('#language-menu');
  this.searchContainer = $('.search-container');
  this.mapContainer = $('.map');
  this.infoBox = $('.infobox');
  this.locationDialog = $('#location-dialog');
  this.locationNavBar = $('#location-nav-bar');
}

var ui;

/** Set up actions on UI elements. */
function setUpUI() {
  // Create global var for the UI elements.
  ui = new UiElements();

  $('#nav_google').click(menuHide);
  $('#nav_bing').click(menuHide);
  $('#nav_osm').click(menuHide);
  $('#nav_apple').click(menuHide);
  $('#nav_apps').click(menuHide);
  $('.nav_dismiss').click(menuHide);

  $('.infobox .pushpin-button').click(togglePushPin);

  $('#menu-button').click(uiClick);
  $('#search-button').click(uiClick);
  $('.bottom-bar > button').click(uiClick);
  $('#main-menu > .promote-layer > li').click(uiClick);
  $('#language-menu > .promote-layer > li').click(uiClick);

  // The dark shading used when showing the menu has a click action,
  // but normally it ignores clicks - it only receives them when it
  // has the open class applied.
  ui.darkbgElement.click(menuHide);

  // Use a mouseover event for button highlighting, because hover doesn't
  // work on mobile.
  if (!isMobile()) {
    $('button').mouseover(function() {$(this).addClass('highlight')});
    $('button').mouseout(function() {$(this).removeClass('highlight')});
  }
  if (navigator.userAgent.toLowerCase().indexOf('ipod') != -1 ||
      navigator.userAgent.toLowerCase().indexOf('iphone') != -1 ||
      navigator.userAgent.toLowerCase().indexOf('mac os') != -1) {
    $('<li>').append(
        $('<a>').attr('id', 'nav_apple'))
        .insertBefore($('#nav_feedback').closest('li'));
  }
  if (navigator.userAgent.toLowerCase().indexOf('android') != -1 ||
      navigator.userAgent.toLowerCase().indexOf('ipod') != -1 ||
      navigator.userAgent.toLowerCase().indexOf('iphone') != -1 ||
      navigator.userAgent.toLowerCase().indexOf('blackberry') != -1) {
    $('<li>').append(
        $('<a>').attr('id', 'nav_apps'))
        .insertBefore($('#nav_feedback').closest('li'));
  }
  loadText();
}

/** Load the localised text into the UI elements. */
function loadText() {
  // Set localised text into the UI
  $('#nav_help').text(messages.get('ui-help'));
  $('#nav_satellite').text(messages.get('ui-satellite'));
  $('#nav_language').text(messages.get('ui-language'));
  $('#nav_google').text(messages.get('google-maps'));
  $('#nav_bing').text(messages.get('bing-maps'));
  $('#nav_osm').text(messages.get('osm-maps'));
  $('#nav_feedback').text(messages.get('ui-feedback'));
  $('#nav_github').text(messages.get('ui-github'));
  // nav_dismiss uses a class because there are two of them.
  $('.nav_dismiss').text(messages.get('dismiss'));

  $('#nav_apple').text(messages.get('apple-maps'));
  $('#nav_apps').text(messages.get('apps'));

  $('.search-input').attr('placeholder', messages.get('input-prompt'));
}


/** Handle a click on a UI element. */
function uiClick(e) {
  var clickedId = null;
  if ('target' in e) {
    clickedId = e.target.id;
  }
  if (clickedId === null) {
    return;
  }
  // Menu button.
  if (clickedId === 'menu-button') {
    menuShow();
  }
  // Search button.
  if (clickedId === 'search-button') {
    ui.searchContainer.toggleClass('open');
    if (ui.searchContainer.hasClass('open')) {
      $('.search-input').focus();
    } else {
      $('.search-input').blur();
    }
  }

  if (clickedId == 'location') {
    locationZoom();
  }
  if (clickedId == 'compass') {
    ui.mapContainer.toggleClass('hide');
    ui.infoBox.toggleClass('hide');
    if (ui.mapContainer.hasClass('hide')) {
      // Map is hidden, so compass should be revealed.
      compass.checkOperation();
    }
  }
  if (clickedId == 'nav_help') {
    menuHide();
    Help.start();
  }
  if (clickedId === 'nav_satellite') {
    // Change the map to/from satellite imagery.
    map.toggleImagery();
    menuHide();
  }
  if (clickedId === 'nav_language') {
    ui.mainMenuContainer.removeClass('open');
    ui.languageContainer.addClass('open');
  }
  if (clickedId.indexOf('lang_') == 0) {
    ui.languageContainer.removeClass('open');
    menuHide();
    // Change the language!
    var lang = clickedId.substr(5);
    if (messages.setLanguage(lang)) {
      loadText();
      if (displayedCode !== null) {
        displayCodeInformation();
        displayCodeMapCompass(displayedCode);
      }
    }
  }
  if (clickedId === 'nav_feedback') {
    menuHide();
    commentShow();
  }
}

/**
 * Update the location buttons classes depending on the visibility of the
 * code and user location.
 */
function updateLocationButton() {
  if (typeof google == 'undefined' || typeof google.maps == 'undefined') {
    return;
  }
  if (displayedCode.code === null) {
    return;
  }
  var button = $('#location');

  var mapBounds = map.map.getBounds();
  // There's always a code.
  var codeCenter = new google.maps.LatLng(
      displayedCode.codeArea.latitudeCenter,
      displayedCode.codeArea.longitudeCenter);
  if (deviceLatLng === null) {
    // We don't have a location for the device, so we're done.
    button.removeClass('location-zoom');
    button.addClass('code-zoom');
    return;
  }
  var userLocation = new google.maps.LatLng(deviceLatLng[0], deviceLatLng[1]);
  // Now we have both locations, so we can decide what to do with them.
  // If they're both in view, zoom to the code, if the code is view zoom to
  // user, and if user is in view zoom to both.
  if (mapBounds.contains(userLocation) && mapBounds.contains(codeCenter)) {
    button.removeClass('location-zoom');
    button.addClass('code-zoom');
  } else if (mapBounds.contains(codeCenter)) {
    button.addClass('location-zoom');
    button.removeClass('code-zoom');
  } else {
    button.removeClass('location-zoom');
    button.removeClass('code-zoom');
  }
}

/** Set the destination URLs for all the alternative map providers. */
function setMapProviderUrls(lat, lng, code) {
  code = encodeURIComponent(code);
  if (typeof lat === 'undefined') {
    $('#nav_google').attr('href', null);
    $('#nav_bing').attr('href', null);
    $('#nav_osm').attr('href', null);
    $('#nav_apple').attr('href', null);
    $('#nav_apps').attr('href', null);
  } else {
    $('#nav_google').attr(
        'href',
        'https://www.google.com/maps/place/' + lat + ',' + lng + '/@' + lat +
        ',' + lng + ',17z');
    $('#nav_bing').attr(
        'href',
        'http://www.bing.com/maps/?v=2&cp=' + lat + '~' + lng +
        '&style=h&lvl=19&sp=Point.' + lat + '_' + lng + '_' + code + '___');
    //
    $('#nav_osm').attr(
        'href',
        'http://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng +
        '&zoom=19');
    $('#nav_apple').attr(
        'href',
        'http://maps.apple.com/?daddr=' + lat + ',' + lng + '&ll=');
    $('#nav_apps').attr(
        'href', 'geo:0,0?q=' + lat + ',' + lng + '(' + code + ')');
  }
}

/** Show the main menu. */
function menuShow() {
  ui.appbarElement.addClass('open');
  ui.mainMenuContainer.addClass('open');
  ui.darkbgElement.addClass('open');
}

/** Hide the main menu - called after handling a click on a menu element. */
function menuHide() {
  ui.languageContainer.removeClass('open');
  ui.appbarElement.removeClass('open');
  ui.mainMenuContainer.removeClass('open');
  ui.darkbgElement.removeClass('open');
}

function locationPromptDisplay() {
  var dialog = new Dialog(
      'location', $('<p>').text(messages.get('location-prompt')),
      locationDismissCallback);
  dialog.addButton(
      $('<button>').addClass('dismiss').click(function() {
          locationDismissCallback();
      }));
}
function locationDismissCallback() {
  Dialog.remove('location');
  locationListener.getCurrentLocation();
}

function browserFeaturesDisplay() {
  var dialog = new Dialog(
      'browser', $('<section>').append($('<p>').html(messages.get('browser-problem-msg'))));
  dialog.addButton(
      $('<button>').addClass('dismiss').click(function() {
          dialog.remove();
      }));
}

function noLocationDisplay(code) {
  var dialog = new Dialog('nolocation',
      $('<section>').append($('<p>').html(messages.get('extend-failure-msg', {OLC: code}))));
  dialog.addButton(
      $('<button>').addClass('dismiss').click(function() {
          dialog.remove();
      }));
}

function commentShow() {
  var dialog = new Dialog('comment',
      $('<section>').append($('<p>').html(messages.get('feedback-detail')))
      .append($('<textarea>')));
  dialog.addButton($('<button>').addClass('dismiss').click(commentControls));
  dialog.addButton($('<button>').addClass('upload').click(commentControls));
}

function commentControls() {
  if ($(this).hasClass('upload')) {
    var message = $('#comment-dialog textarea').val().trim();
    if (message != '') {
      var lat = null;
      var lng = null;
      if (deviceLatLng !== null) {
        lat = deviceLatLng[0];
        lng = deviceLatLng[1];
      }
      Feedback.storeFeedback(
          lat,
          lng,
          displayedCode,
          $('.infobox .address').text(),
          map.isReady(),
          compass.appearsGood(),
          messages.language,
          message);
    }
  }
  Dialog.remove('comment');
}

function compassCheckDisplay() {
  var table = $('<table>').append('<tr>')
      .append($('<td>').append($('<p>').html(messages.get('compass-check-msg'))))
      .append($('<td>').append('<span>').attr('id', 'compass_rotate_demo'));
  var dialog = new Dialog('compass', table);
  dialog.addButton(
      $('<button>').addClass('next').click(compassCheckNext));
}

function compassCheckNext() {
  if (compass.appearsGood()) {
    var dialog = new Dialog('compass',
        $('<p>').text(messages.get('compass-check-ok')));
  } else {
    var dialog = new Dialog('compass', $('<p>').html(messages.get('compass-check-fail-msg')));
  }
  dialog.addButton(
      $('<button>').addClass('dismiss').click(
          function() {Dialog.remove('compass')}));
}

/** User has entered a search. */
function searchEntered() {
  // Remove input focus so mobile keyboards hide themselves.
  document.querySelector('.search-input').blur();
  ui.searchContainer.removeClass('open');
  var input = document.querySelector('.search-input').value.trim();
  if (input === '') {
    return;
  }
  InfoBox.clear();
  // Split the input into a code, address, latLng and optional message.
  var fields = splitSearchInput(input);
  // Possible cases are:
  // 1. Short code with no address. We need to use the user location or map
  //    center.
  // 2. Full code with no address. Display.
  // 3. Short code with address. Need to geocode address, recover full code,
  //    then display.
  // 4. Full code with address. Just display the full code.
  // 5. Address only.
  // 6. LatLng only.
  // Work through the cases and compute what code to display.
  // drinckes
  var codeToDisplay = '';
  var recoveryLocation = getRecoveryLocation();
  // Case 1
  if (fields['short'] && !fields['address']) {
    if (recoveryLocation[0] === null) {
      // Got neither. Should show an error message!
      noLocationDisplay(fields['short']);
      return;
    } else {
      // Use our current location or map center to extend the short code.
      codeToDisplay = OpenLocationCode.recoverNearest(
          fields['short'], recoveryLocation[0], recoveryLocation[1]);
    }
  } else if (fields['full']) {
    // Case 2 & 4 - ignore the address.
    codeToDisplay = fields['full'];
  } else if (fields['latLng']) {
    latLng = fields['latLng'].split(',');
    codeToDisplay = OpenLocationCode.encode(
        parseFloat(latLng[0]), parseFloat(latLng[1]));
  }
  // Do we have a code to display? Because we can display it.
  if (codeToDisplay) {
    displayedCode.setCode(codeToDisplay);
    displayedCode.setUrl();
    displayedCode.is_pinned = true;
    pushPushPin();
    displayCodeInformation();
    displayCodeMapCompass();
    zoomToCode();
  } else {
    // If not, we must be in case 3 or 5.
    $.when(
        // Geocode the address. Pass the recovery location just in case.
        Geocoder.geocodeAddress(
            fields['address'], recoveryLocation[0], recoveryLocation[1])
    ).then(
        function(address, lat, lng) {
          // If we only had an address, use the passed lat and lng.
          if (!fields['short']) {
            codeToDisplay = OpenLocationCode.encode(lat, lng);
          } else {
            try {
              // Use the location to recover the short code.
              codeToDisplay = OpenLocationCode.recoverNearest(
                  fields['short'], lat, lng);
            } catch (e) {
              return;
            }
          }
          if (codeToDisplay) {
            displayedCode.is_pinned = true;
            pushPushPin();
            displayedCode.setCode(codeToDisplay);
            displayedCode.setUrl();
            displayCodeInformation();
            displayCodeMapCompass();
            zoomToCode();
          }
        },
        function(error) {
          // Use jQuery to escape the error message to prevent XSS.
          var escapedError = $("<div>").text(error).html();
          InfoBox.setPanel(
              '<span><p class="message">' + escapedError + '</p></span>');
        }
    );
  }
}

/** Toggle the push pin. */
function togglePushPin() {
  $('.infobox .pushpin-button').toggleClass('pushed');
  displayedCode.is_pinned = $('.infobox .pushpin-button').hasClass('pushed');
  receiveMapBoundsEvent();
}

function pushPushPin() {
  $('.infobox .pushpin-button').addClass('pushed');
}
LocalisedMessages["ar"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "التطبيقات"
  }, 
  "bing-maps": {
    "message": "Bing Maps"
  }, 
  "browser-problem-msg": {
    "message": "لا يدعم المتصفح الذي تستخدمه كل الميزات التي نحتاجها، مثل الموقع والبوصلة.<br/><br/>نوصي باستخدام Chrome أو Firefox أو Opera."
  }, 
  "compass-check-fail-msg": {
    "message": "البوصلة على جهازك لا تبلغ عن الاتجاه. قد لا تكون البوصلة معتمدة من جهازك، أو قد لا تعمل بشكلٍ صحيح."
  }, 
  "compass-check-msg": {
    "message": "قد تكون هناك مشكلة في قراءة البوصلة.<br/><br/>لاختبارها، أمسك بجهازك بشكلٍ مستوي وأدره في دائرة.<br/><br/>عند الانتهاء من تدوير الجهاز بالكامل، انقر على الزر أدناه."
  }, 
  "compass-check-ok": {
    "message": "يبدو أن البوصلة على جهازك تعمل بشكلٍ جيد!"
  }, 
  "dismiss": {
    "message": "تجاهل"
  }, 
  "extend-failure-msg": {
    "message": "لمعرفة مكان وجود $OLC$، يلزمنا الحصول على موقعك الحالي، أو يلزمك إدراج بلدة أو مدينة في المعلومات.<br/><br/>تحقق من أن متصفحك يسمح بتحديد الموقع، وأن خدمات المواقع قد تم تمكينها على جهازك.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "أرسل تعليقات. أطلعنا على ما تحبه، أو على العناصر ضعيفة الأداء وسنحاول تحسينها."
  }, 
  "geocode-fail": {
    "message": "تعذّر على خدمة العناوين في Google تحديد موقع $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "لم يتم تحميل خدمة العناوين في Google، ويتعذّر تحديد موقع $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "تعذّر الحصول على أي معلومات للمنطقة المحلية (حدث خطأ في خدمة ترميز المناطق الجغرافية‬ في Google)"
  }, 
  "geocoder-no-info": {
    "message": "لا تتوفر لخدمة ترميز المناطق الجغرافية‬ في Google معلومات للعناوين في هذه المنطقة. قد يكون بمقدورك استخدام رمز plus+‎ مع اسم بلدة كبيرة إذا كانت موجودة في حدود 40 كم."
  }, 
  "google-maps": {
    "message": "خرائط Google"
  }, 
  "help-01-0": {
    "message": "<h2>رمزك البريدي الشخصي</h2><p>تكون رموز plus+‎ عبارة على رموز قصيرة لأي موقع في أي مكان. ويمكنك استخدامها لتوجيه الأشخاص إلى موقعك بالضبط، بشكلٍ سريع ويُعتمد عليه.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>ما المقصود برمز plus+‎؟</h2><p>رمز plus+‎ عبارة عن رمز قصير يتألف من ستة أو سبعة أحرف وأرقام، مثل <b>$EXAMPLE_CODE$</b>، أو يُضاف إلى بلدة أو مدينة مثل هذا <b>$EXAMPLE_CODE$ نيروبي</b>.</p><p>ويسمح لك هذا الرمز بإعطاء أي شخص الموقع الدقيق دون الاعتماد على أسماء الشوارع أو أرقام المباني.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>كيف يمكنني معرفة مكان وجود رمز plus+‎؟</h2><p>عندما تُدخل رمز plus+‎ (<b>$EXAMPLE_CODE$</b>) على الهاتف أو جهاز الكمبيوتر الذي تستخدمه، فسيبحث عن أقرب مطابقة. وسيعرض هذا الرمز الموقع الصحيح طالما كنت في حدود 40 كيلومترًا تقريبًا من المكان.</p><p>إذا كنت أبعد من ذلك، فاستخدم اسم البلدة أو المدينة (<b>$EXAMPLE_CODE$ نيروبي</b>)، أو أدخل رمز plus+‎ متضمنًا رمز المنطقة (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>هل أنا بحاجة إلى تقديم طلب للحصول على رمز plus+‎؟</h2><p>كلا، فرموز plus+‎ موجودة فعلاً لأي مكان، ويمكن لأي شخص استخدامها مجانًا.</p><p>للحصول على رمز plus+‎ لمكان معين، ما عليك سوى سحب الخريطة لتمييز المكان المطلوب.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>ما أجزاء الرمز؟</h2><p>في مثال الرمز الذي نعرضه <b>$FULL_CODE$</b>، <b>$CODE_PART_1$</b> هو رمز المنطقة (100 × 100 كيلومتر تقريبًا). <b>$CODE_PART_2$</b> هو رمز المدينة (5 × 5 كيلومترات). <b>$CODE_PART_3$</b> هو رمز الحي (250 × 250 مترًا). بعد علامة <b>+</b>، <b>$CODE_PART_4$</b> هو رمز المبنى (14 × 14 مترًا). ويمكن أن يتبعه رمز الباب المؤلف من رقم واحد، إذا كان رمز حجم المبنى يمتد إلى أكثر من مبنى واحد.</p><p>ليست هناك حاجة في العادة لرمز المنطقة، وستتمكن في بعض الأحيان من إسقاط رمز المدينة أيضًا.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>هل يحتوي الموقع على أكثر من رمز plus+‎ واحد؟</h2><p>كلا. يحتوي أي مكان على رمز plus+‎ واحد فقط.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>هل يمكنني حفظها؟</h2><p>لحفظ أحد رموز plus+‎، ما عليك سوى إنشاء إشارة مرجعية للصفحة. وعند فتح الإشارة المرجعية، ستعرض لك المكان.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>هل يمكنني استخدام هذه الخدمة عندما لا تتوافر لديّ شبكة؟</h2><p>نعم، يمكنك ذلك! بعد الانتهاء من تحميل هذه الصفحة على الهاتف أو جهاز الكمبيوتر الذي تستخدمه، ستحتفظ الخدمة بنسخة وتسمح لك بتحميلها حتى دون وجود اتصال بالشبكة.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>هل يمكنني الحصول على الاتجاهات؟</h2><p>هناك وضع للبوصلة يعرض لك الاتجاه والمسافة من مكان وجودك إلى رمز plus+‎ الحالي. وتحتوي القائمة الرئيسية على روابط مؤدية إلى مقدمي خرائط مختلفين يمكنك الاستعانة بهم.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>منطقة رمز plus+‎ كبيرة جدًا!</h2><p>إذا اخترت التكبير إلى أكثر من ذلك، فسيكون الرمز مخصصًا لمنطقة أصغر.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>العنوان الذي تعرضه غير صحيح!</h2><p>العنوان المقدم مجرد اقتراح، ويُستخدم لتقليل طول الرمز الذي تحتاج إلى استخدامه. يمكنك تجربة عناوين أخرى في مربّع البحث.</p>"
  }, 
  "input-prompt": {
    "message": "أدخل رمز plus+‎ أو عنوانًا أو اسحب الخريطة"
  }, 
  "location-prompt": {
    "message": "تحتاج هذه الخدمة إلى استخدام موقعك. إذا عرض المتصفح رسالة مطالبة، يُرجى السماح بذلك."
  }, 
  "map-error": {
    "message": "يتعذّر تحميل خرائط Google. تأكد من توافر شبكة تعمل فعلاً وجرِّب إعادة تحميل الصفحة.<br/><br/>يمكنك إدخال رموز plus+‎ مع أو دون رمز المنطقة، واستخدام البوصلة، ولكنك لن تتمكن من إدخال عناوين، أو رموز plus+‎ مع عناوين، إلى أن يتم عرض الخرائط."
  }, 
  "osm-maps": {
    "message": "فتح خريطة الشارع"
  }, 
  "ui-feedback": {
    "message": "تعليقات"
  }, 
  "ui-github": {
    "message": "عرض المشروع"
  }, 
  "ui-help": {
    "message": "مساعدة"
  }, 
  "ui-language": {
    "message": "اللغة"
  }, 
  "ui-satellite": {
    "message": "القمر الصناعي"
  }, 
  "units-km": {
    "message": "كم"
  }, 
  "units-meters": {
    "message": "م"
  }, 
  "waiting-for-compass-1": {
    "message": "في انتظار"
  }, 
  "waiting-for-compass-2": {
    "message": "قراءة البوصلة"
  }, 
  "waiting-location": {
    "message": "في انتظار الموقع..."
  }
}
LocalisedMessages["bn"] = {
  "apple-maps": {
    "message": "Apple মানচিত্র"
  }, 
  "apps": {
    "message": "Apps"
  }, 
  "bing-maps": {
    "message": "Bing মানচিত্র"
  }, 
  "browser-problem-msg": {
    "message": "আপনি যে ব্রাউজারটি ব্যবহার করছেন সেটি আমাদের যে বৈশিষ্ট্য দরকার যেমন আপনার অবস্থান, কম্পাস প্রভৃতি সমর্থন করে না l<br/><br/>আমরা Chrome, Firefox অথবা Opera ব্যাবহার করার পরামর্শ দিই l"
  }, 
  "compass-check-fail-msg": {
    "message": "আপনার ডিভাইসের কম্পাসটি ঠিকমত দিক নির্দেশ করছে না l আপনার ডিভাইস হয়তো কম্পাসটিকে সাপোর্ট করছে না অথবা কম্পাসটি ঠিকমত কাজ করছে না l"
  }, 
  "compass-check-msg": {
    "message": "কম্পাসটি পড়তে কিছু সমস্যা হতে পারে l<br/><br/>সেটি পরীক্ষা করার জন্য ডিভাইসটিকে সোজাভাবে ধরুন আর বৃত্তাকারে ঘোরাতে থাকুন l<br/><br/>যখন সেটি সম্পূর্ণ ঘোরানো হয়ে যাবে, তখন নিচের বোতামটি টিপুন l"
  }, 
  "compass-check-ok": {
    "message": "আপনার ডিভাইসের কম্পাসটি দেখে ঠিক মনে হচ্ছে!"
  }, 
  "dismiss": {
    "message": "খারিজ করুন"
  }, 
  "extend-failure-msg": {
    "message": "$OLC$ কোথায় সেটা জানতে হলে আপনার বর্তমান অবস্থান জানা প্রয়োজন, অথবা আপনাকে তথ্যের জায়গায় কোনও শহর বা নগরের নাম অন্তর্ভুক্ত করতে হবে l<br/><br/>লক্ষ্য রাখবেন যাতে আপনার ব্রাউজার আপনার অবস্থান জানানোর অনুমতি দেয় আর আপনার ডিভাইস অবস্থান পরিষেবাগুলিকে সক্ষম রাখে l", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "আমাদের মতামত পাঠান l আপনার কি পছন্দ, বা কোনটা কাজ করছে না সেটা আমাদের জানান আর আমরা সেটা আরো উন্নত করতে চেষ্টা করব l"
  }, 
  "geocode-fail": {
    "message": "Google ঠিকানা সংক্রান্ত পরিষেবা খুঁজে বের করতে পারছে না $ADDRESS$l", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Google's ঠিকানা সংক্রান্ত পরিষেবা লোড করা যাচ্ছে না, খুঁজে পাওয়া যাচ্ছে না $ADDRESS$l", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "বর্তমান অবস্থানের কোনও তথ্য পাওয়া যায়নি (Google's geocoder পরিষেবায় ত্রুটি দেখা দিয়েছে)"
  }, 
  "geocoder-no-info": {
    "message": "Google's geocoder পরিষেবার কোনো ঠিকানা সংক্রান্ত তথ্য এই এলাকায় পাওয়া যাচ্ছে না l আপনি অবশ্যই কোনো বড় শহরের নাম দিয়ে plus+code ব্যাবহার করতে পারবেন যদি 40 কিমি. -এর মধ্যে কোনোটি থাকে l"
  }, 
  "google-maps": {
    "message": "Google মানচিত্র"
  }, 
  "help-01-0": {
    "message": "<h2>আপনার নিজস্ব ব্যাক্তিগত পোস্টকোড</h2><p>plus+codes হল যেকোন স্থান বা জায়গায় ব্যাবহার করার জন্য ছোট কোড l অতি দ্রুত আপনার স্থান অন্যদের প্রদর্শন করার জন্য আপনি সেগুলোকে ব্যাবহার করতে পারেন এবং সেগুলো নির্ভরযোগ্য l</p>"
  }, 
  "help-02-0": {
    "message": "<h2>plus+code কি?</h2><p>plus+code হল অক্ষর আর সংখ্যা দিয়ে গঠিত ছয় বা সাত অক্ষরের একটি কোড, যেমন <b>$EXAMPLE_CODE$</b>, অথবা শহর বা নগরের সমন্বয়ে গঠিত যেমন <b>$EXAMPLE_CODE$ নাইরোবি</b>.</p><p>সেগুলি সবাইকে সঠিক অবস্থান জানাবে যেটি রাস্তার নাম বা বাড়ির সংখ্যার উপর নির্ভর করে না l</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>আমি কিভাবে জানবো যে plus+code কোথায় আছে?</h2><p>যখন আপনি আপনার ফোন অথবা কম্পিউটারে প্লাস+code দেবেন (<b>$EXAMPLE_CODE$</b>) সেটি কাছাকাছি অনুরুপ শব্দ খুঁজে নেবে l সেটা আপনাকে সঠিক অবস্থানও দেখাবে যতক্ষণ আপনি সেই জায়গার মোটামুটি 40 কিমি দূরত্বের মধ্যে থাকবেন l</p><p>যদি আপনি তার থেকেও বেশী দূরে থাকেন তাহলে আপনি শহর বা নগরের নাম ব্যাবহার করুন (<b>$EXAMPLE_CODE$ নাইরোবি</b>), অথবা আঞ্চলিক কোড সহ plus+code দিন (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>আমাকে কি plus+code জন্য আবেদন করতে হবে?</h2><p>না, plus+codes আগে থেকেই সবার জন্য রয়েছে আর যে কেউ সেটি বিনামূল্যে ব্যাবহার করতে পারে l</p><p> কোনো স্থানের plus+code পাওয়ার জন্য মানচিত্রটাকে টেনে সেই হাইলাইট স্থানে নিয়ে আসুন l</p>"
  }, 
  "help-03-0": {
    "message": "<h2>code-এর অংশগুলি কি ?</h2><p>উদাহরণস্বরূপ যে কোড রয়েছে <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> সেটি হল আঞ্চলিক কোড (মোটামুটি 100 x 100কিমি) l <b>$CODE_PART_2$</b> হল শহরের কোড (5 x 5 কিমি) l <b>$CODE_PART_3$</b>হল স্থানীয় কোড (250 x 250 মিটার) l এর পরে <b>+</b>, <b>$CODE_PART_4$</b> হল বাড়ির কোড (14x14 মিটার) l বাড়ির কোড যদি একটি বাড়িকে ছাড়িয়ে যায় তাহলে প্রবেশপথের জন্য এক সংখ্যার কোড এর পর ব্যাবহার করা যেতে পরে l</p><p>সাধারণত:, আঞ্চলিক কোডের প্রয়োজন হয় না, কখনো আবার আপনি শহরের কোড নাও ব্যাবহার করতে পারেন l</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>কোনো একটি অবস্থানের কি একটির বেশি plus+code আছে?</h2><p>না l কোনো একটি স্থানের শুধুমাত্র একটিই plus+code আছে l</p>"
  }, 
  "help-03-2": {
    "message": "<h2>আমি কি সেগুলোকে সেভ করতে পারি?</h2><p>plus+code সেভ করতে গেলে এই পেজের জন্য একটি বুকমার্ক তৈরি করুন l যখন আপনি বুকমার্কটি খুলবেন সেটি আপনাকে সেই জায়গাটা দেখাবে l</p>"
  }, 
  "help-03-3": {
    "message": "<h2>আমার যদি নেটওয়ার্ক না থাকে তাহলে আমি কি এটা ব্যাবহার করতে পারব?</h2><p>অবশ্যই! যখনই আপনি আপনার ফোন বা কম্পিউটারে পেজটি লোড করবেন, এটি তার একটি প্রতিলিপি রেখে দেবে আর আপনার নেটওয়ার্ক সংযোগ না থাকলেও আপনাকে এটি লোড করতে দেবে l</p>"
  }, 
  "help-03-4": {
    "message": "<h2>আমি কি কোনো দিক নির্দেশ পেতে পারি?</h2><p>সেখানে কম্পাস মোড রয়েছে যেটা আপনি যেখানে রয়েছেন সেখান থেকে স্থানীয় plus+code পর্যন্ত রাস্তার অভিমুখ আর দূরত্ব দেখাবে l প্রধান মেনুতে আপনি বিভিন্ন মানচিত্র প্রদানকারীর লিঙ্ক ব্যবহার করতে পারেন l</p>"
  }, 
  "help-03-5": {
    "message": "<h2>আমার plus+code এরিয়াটি খুবই বড়!</h2><p>আপনি যদি ভিতরের দিকে আরো জুম্ বাড়ান তাহলে সেই কোডটি একটি অতি ছোট স্থানের জন্য হবে l</p>"
  }, 
  "help-03-6": {
    "message": "<h2>আপনি যে ঠিকানাটি দেখাচ্ছেন সেটি ভুল!</h2><p>যে ঠিকানাটি দেখানো হয়েছে সেটি একটি প্রস্তাব মাত্র l যে code আপনি ব্যাবহার করবেন তার দৈর্ঘ্য ছোট করার জন্য এটি ব্যাবহার করা হয়েছে l আপনি অনুসন্ধান বাক্সে অন্য কোনো ঠিকানাও ব্যাবহার করতে পারেন l</p>"
  }, 
  "input-prompt": {
    "message": "plus+code, ঠিকানা দিন অথবা মানচিত্রটা টেনে নিয়ে আসুন"
  }, 
  "location-prompt": {
    "message": "এই পরিষেবা আপনার বর্তমান অবস্থান জানতে চায় l যদি আপনার ব্রাউজার আপনার অনুমতি চায়, আপনি দয়া করে এটি অনুমোদন করুন l"
  }, 
  "map-error": {
    "message": "Google মানচিত্র লোড করা যাচ্ছে না l নেটওয়ার্ক কাজ করছে কি না দেখে নিন আর অনুগ্রহ করে পেজটি পুনরায় লোড করুন l<br/><br/>আপনি এরিয়া কোড দিয়ে বা এরিয়া code ছাড়া plus+codes দিতে পারবেন আর কম্পাস ব্যাবহার করতে পারবেন কিন্তু আপনি আপনার ঠিকানা বা plus+codes সহ ঠিকানা দিতে পারবেন না যতক্ষণ না মানচিত্রে প্রদর্শন করা যায় l"
  }, 
  "osm-maps": {
    "message": "ওপেন স্ট্রিট ম্যাপ"
  }, 
  "ui-feedback": {
    "message": "প্রতিক্রিয়া"
  }, 
  "ui-github": {
    "message": "প্রকল্পটি দেখুন"
  }, 
  "ui-help": {
    "message": "সহায়তা"
  }, 
  "ui-language": {
    "message": "ভাষা"
  }, 
  "ui-satellite": {
    "message": "উপগ্রহ"
  }, 
  "units-km": {
    "message": "কিমি"
  }, 
  "units-meters": {
    "message": "মিটার"
  }, 
  "waiting-for-compass-1": {
    "message": "জন্য অপেক্ষা করছে"
  }, 
  "waiting-for-compass-2": {
    "message": "কম্পাস পড়ার"
  }, 
  "waiting-location": {
    "message": "অবস্থানের জন্য অপেক্ষা করা হচ্ছে..."
  }
}
/*
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

/**
 * English language messages file. If in doubt, uses en-GB spelling.
 * Creates an entry "en" in the messages dict. Each message consists of an ID,
 * and an object with the message, a description which is only relevant to
 * translators (other languages need not include the description attribute).
 *
 * The message may have placeholders for data which will be inserted into them.
 * Placeholders should not be translated, are uppercase and enclosed in "$" e.g.
 * "$ADDRESS$".
 *
 * Some placeholders have default values defined for them. These will be
 * inserted into the message when it is fetched. They are defined with the
 * "placeholders" object, listing each value and defining the content. The
 * content may be changed in other languages, for example to change an example
 * OLC code used in the help text to one more relevant.
 */
LocalisedMessages["en"] = {
  "input-prompt": {
    "message": "Enter a plus+code, address or drag the map",
    "description": "Text to display in the search box to tell a user how to interact with the application"
  },
  "map-error": {
    "message": "Cannot load Google Maps. Make sure you have a working network and try reloading the page.<br/><br/>You can enter enter plus+codes with or without the area code, and use the compass, but you will not be able to enter addresses, or plus+codes with addresses, until maps are displayed.",
    "description": "Message to display when Google Maps can't be loaded"
  },
  "browser-problem-msg": {
    "message": "The browser you are using does not support all the features we need, such as location and compass.<br/><br/>We recommend using to Chrome, Firefox or Opera.",
    "description": "Message to show when the browser doesn't support location or orientation"
  },
  "geocoder-no-info": {
    "message": "Google's geocoder service has no address information in this area. You might be able to use a plus+code with the name of a large town, if there is one within 40km.",
    "description": "If Google can't find any location name in the area"
  },
  "extend-failure-msg": {
    "message": "To work out where $OLC$ is, we need your current location, or you need to include a town or city in the information.<br/><br/>Check that your browser is allowing location, and that location services are enabled on your device.",
    "description": "Shown when the user location cannot be determined"
  },
  "geocode-not-loaded": {
    "message": "Google's address service is not loaded, can't locate $ADDRESS$.",
    "description": "The address the user entered cannot be located, because the Google geocoding service isn't loaded"
  },
  "geocode-fail": {
    "message": "Google's address service can't locate $ADDRESS$.",
    "description": "The address the user entered cannot be located"
  },
  "geocode-reverse-fail": {
    "message": "Could not get any locality information (Google's geocoder service had an error)",
    "description": "Google returned no address information for the location shown because the service had an unspecified error"
  },
  "google-maps": {
    "message": "Google Maps",
    "description": "Menu entry to link to see the current location in Google Maps"
  },
  "osm-maps": {
    "message": "Open Street Map",
    "description": "Menu entry to link to see the current location in Open Street Map"
  },
  "bing-maps": {
    "message": "Bing Maps",
    "description": "Menu entry to link to see the current location in Bing Maps"
  },
  "apple-maps": {
    "message": "Apple Maps",
    "description": "Menu entry to link to see the current location in Apple Maps"
  },
  "apps": {
    "message": "Apps",
    "description": "Menu entry to link to see the current location in a smartphone app. The phone should display a list and allow the user to select one."
  },
  "waiting-location": {
    "message": "Waiting for location...",
    "description": "Displayed while waiting for the device location to be determined"
  },
  "units-km": {
    "message": "km",
    "description": "Used when displaying distances in kilometers"
  },
  "units-meters": {
    "message": "meters",
    "description": "Used when displaying distances in meters"
  },
  "compass-check-msg": {
    "message": "There could be a problem reading the compass.<br/><br/>To test it, hold your device flat and turn around in a circle.<br/><br/>When you have turned completely around, tap the button below.",
    "description": "If the orientation of the device can't be determined, this asks the user to turn the device around in a circle to test it"
  },
  "compass-check-fail-msg": {
    "message": "The compass on your device is not reporting the direction. The compass might not be supported by your device, or it might not be working properly.",
    "description": "The device does not have a compass, or it cannot be read correctly"
  },
  "compass-check-ok": {
    "message": "The compass on your device looks OK!",
    "description": "The comass on the device can be read and looks good"
  },
  "waiting-for-compass-1": {
    "message": "Waiting for",
    "description": "First half of 'waiting for compass reading' message"
  },
  "waiting-for-compass-2": {
    "message": "compass reading",
    "description": "Second half of 'waiting for compass reading' message"
  },
  "location-prompt": {
    "message": "This service needs to use your location. If your browser asks, please allow it.",
    "description": "Notifies the user that they may be asked to share their location"
  },
  "ui-help": {
    "message": "Help",
    "description": "Menu item to display the help information"
  },
  "ui-satellite": {
    "message": "Satellite",
    "description": "Menu item to change the map imagery between satellite and the road map"
  },
  "ui-language": {
    "message": "Language",
    "description": "Menu item to display the list of UI languages"
  },
  "ui-feedback": {
    "message": "Feedback",
    "description": "Menu item to display the form to provide feedback"
  },
  "ui-github": {
    "message": "View project",
    "description": "Menu item to view the project source code on Github"
  },
  "dismiss": {
    "message": "Dismiss",
    "description": "Button used in dialog windows to dismiss them"
  },
  "help-01-0": {
    "message": "<h2>Your own personal postcode</h2><p>plus+codes are short codes for any location, anywhere. You can use them to guide people to your exact location, fast and reliably.</p>",
    "description": "First help page explaining what plus+codes are"
  },
  "help-02-0": {
    "message": "<h2>What is a plus+code?</h2><p>A plus+code is a short code made up of six or seven letters and numbers, like <b>$EXAMPLE_CODE$</b>, or combined with a town or city like this <b>$EXAMPLE_CODE$ Nairobi</b>.</p><p>They let you give someone an exact location that doesn't depend on street names or building numbers.</p>",
    "description": "Help page section",
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  },
  "help-02-1": {
    "message": "<h2>How do I find out where a plus+code is?</h2><p>When you enter a plus+code (<b>$EXAMPLE_CODE$</b>) on your phone or computer, it will find the nearest match. This will return the correct location as long as you are within about 40 kilometers of the place.</p><p>If you are further away, use the town or city name (<b>$EXAMPLE_CODE$ Nairobi</b>), or enter the plus+code including the region code (<b>$FULL_CODE$</b>).</p>",
    "description": "Help page section",
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      },
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  },
  "help-02-2": {
    "message": "<h2>Do I need to apply for a plus+code?</h2><p>No, plus+codes already exist for everywhere and anyone can use them for free.</p><p>To get the plus+code for a place just drag the map to highlight the place you want.</p>",
    "description": "Help page section"
  },
  "help-03-0": {
    "message": "<h2>What are the parts of the code?</h2><p>For our example code <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> is the region code (roughly 100 x 100 kilometers). <b>$CODE_PART_2$</b> is the city code (5 x 5 kilometers). <b>$CODE_PART_3$</b> is the neighbourhood code (250 x 250 meters). After the <b>+</b>, <b>$CODE_PART_4$</b> is the building code (14 x 14 meters). It can be followed by a single digit door code, if the building size code extends over more than one building.</p><p>Usually, the region code isn't needed, and sometimes you will be able to drop the city code as well.</p>",
    "description": "Help page section giving the structure of the codes",
    "placeholders": {
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      },
      "CODE_PART_1": {
        "content": "6GCR"
      },
      "CODE_PART_2": {
        "content": "MQ"
      },
      "CODE_PART_3": {
        "content": "RG"
      },
      "CODE_PART_4": {
        "content": "59"
      }
    }
  },
  "help-03-1": {
    "message": "<h2>Does a location have more than one plus+code?</h2><p>No. Any place only has one plus+code.</p>",
    "description": "Help page section"
  },
  "help-03-2": {
    "message": "<h2>Can I save them?</h2><p>To save a plus+code, just create a bookmark for the page. When you open the bookmark, it will show you the place.</p>",
    "description": "Help page section"
  },
  "help-03-3": {
    "message": "<h2>Can I use this when I don't have a network?</h2><p>Yes! After you have loaded this page on your phone or computer, it will keep a copy and let you load it even without a network connection.</p>",
    "description": "Help page section telling the user that it should work offline"
  },
  "help-03-4": {
    "message": "<h2>Can I get directions?</h2><p>There is a compass mode that shows you the direction and distance from where you are to the current plus+code. The main menu has links to different map providers you can use.</p>",
    "description": "Help page section"
  },
  "help-03-5": {
    "message": "<h2>My plus+code area is too large!</h2><p>If you zoom in further, the code will be for a smaller area.</p>",
    "description": "Help page section"
  },
  "help-03-6": {
    "message": "<h2>The address you show is wrong!</h2><p>The address given is just a suggestion. It is used to reduce the length of the code you need to use. You can try other addresses in the search box.</p>",
    "description": "Help page section"
  },
  "feedback-detail": {
    "message": "Send feedback. Let us know what you like, or what is not working and we'll try to improve.",
    "description": "Message"
  }
};
LocalisedMessages["es"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "Aplicaciones"
  }, 
  "bing-maps": {
    "message": "Bing Maps"
  }, 
  "browser-problem-msg": {
    "message": "El navegador que utilizas no admite todas las funciones que necesitamos, como la ubicación y la brújula.<br/><br/>Te recomendamos que utilices Chrome, Firefox u Opera."
  }, 
  "compass-check-fail-msg": {
    "message": "La brújula de tu dispositivo no apunta a ninguna dirección. Puede ser que no sea compatible con tu dispositivo o que no funcione correctamente."
  }, 
  "compass-check-msg": {
    "message": "Es posible que haya surgido un problema al leer la brújula.<br/><br/>Para probarla, mantén el dispositivo en posición horizontal y gira sobre ti mismo 360º.<br/><br/>Cuando hayas dado toda la vuelta, toca el botón que aparece debajo."
  }, 
  "compass-check-ok": {
    "message": "La brújula del dispositivo funciona bien."
  }, 
  "dismiss": {
    "message": "Ignorar"
  }, 
  "extend-failure-msg": {
    "message": "Para determinar la ubicación de $OLC$, necesitamos tu ubicación actual o que incluyas una ciudad o una población en la información que proporcionas.<br/><br/>Comprueba que el navegador admita la función de ubicación y que los servicios de ubicación estén habilitados en tu dispositivo.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "Envía sugerencias. Dinos qué te gusta o qué no funciona e intentaremos mejorarlo."
  }, 
  "geocode-fail": {
    "message": "El servicio de direcciones de Google no puede localizar $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "El servicio de direcciones de Google no está cargado, por lo que no es posible localizar $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "No se ha podido obtener ninguna información de la localidad (se ha producido un error en el servicio de codificador geográfico de Google)"
  }, 
  "geocoder-no-info": {
    "message": "El servicio de codificador geográfico de Google no tiene ninguna información de dirección de esta área. Puedes utilizar un código plus+code con el nombre de una ciudad grande, si hay alguna en un radio de 40 km a la redonda."
  }, 
  "google-maps": {
    "message": "Google Maps"
  }, 
  "help-01-0": {
    "message": "<h2>Tu propio código postal personal</h2><p>Los códigos plus+code son códigos cortos de ubicaciones de todo el mundo. Puedes utilizarlos para guiar a otros usuarios hasta tu ubicación exacta de forma rápida y fiable.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>¿Qué es un código plus+code?</h2><p>Un código plus+code es un código corto formado por seis o siete letras y números, como <b>$EXAMPLE_CODE$</b>, o combinado con una ciudad o población como este ejemplo: <b>$EXAMPLE_CODE$ Nairobi</b>.</p><p>Estos códigos permiten indicar a otros usuarios una ubicación exacta sin utilizar nombres de calles ni números de edificios.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>¿Cómo puedo localizar la ubicación que indica un código plus+code?</h2><p>Cuando introduces un código plus+code (<b>$EXAMPLE_CODE$</b>) en el teléfono o en el equipo, este buscará el punto de referencia más cercano que coincida con este parámetro y se te mostrará la ubicación correcta si te hallas en un radio de 40 kilómetros de distancia del lugar en cuestión.</p><p>Si te encuentras más lejos, utiliza el nombre de la ciudad o la población (<b>$EXAMPLE_CODE$ Nairobi</b>), o introduce el código plus+code con el código de región (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>¿Los códigos plus+code tienen que solicitarse?</h2><p>No, estos códigos ya existen para todas las ubicaciones y son de uso gratuito.</p><p>Para obtener el código plus+code de un lugar, solo tienes que arrastrar el mapa para destacar el lugar en cuestión.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>¿Cuáles son las partes del código?</h2><p>En el caso de nuestro ejemplo <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> es el código de región (100 x 100 kilómetros aproximadamente), <b>$CODE_PART_2$</b> es el código de ciudad (5 x 5 kilómetros) y <b>$CODE_PART_3$</b> es el código de barrio (250 x 250 metros). Después del signo <b>+</b>, <b>$CODE_PART_4$</b> constituye el código de edificio (14 x 14 metros). Puede ir seguido de un código de portal de un solo dígito si el código de tamaño de edificio abarca más de un edificio.</p><p>Normalmente, el código de región no es necesario y, a veces, puede que también tengas que quitar el código de ciudad.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>¿Una ubicación tiene más de un código plus+code?</h2><p>No, cada lugar tiene un único código plus+code.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>¿Puedo guardarlos?</h2><p>Para guardar un código plus+code, solo tienes que crear un marcador de la página. Cuando abras el marcador, te mostrará el lugar en cuestión.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>¿Puedo utilizar esto cuando no tenga conexión de red?</h2><p>Sí. Una vez que hayas cargado esta página en el teléfono o en el equipo, se guardará una copia y podrás cargarla aunque no tengas conexión de red.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>¿Puedo obtener indicaciones?</h2><p>Hay un modo de brújula que muestra la dirección en la que debes ir y la distancia hasta el código plus+code desde tu ubicación actual. El menú principal contiene enlaces a varios proveedores de mapas que puedes utilizar.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>El área de mi código plus+code es demasiado grande.</h2><p>Si aumentas la imagen, el código será para un área más pequeña.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>La dirección que muestras no es correcta.</h2><p>La dirección indicada solo es una sugerencia, sirve para acortar el código que tienes que utilizar. Puedes probar otras direcciones del cuadro de búsqueda.</p>"
  }, 
  "input-prompt": {
    "message": "Introduce un código plus+code, una dirección o arrastra el mapa"
  }, 
  "location-prompt": {
    "message": "Este servicio necesita utilizar tu ubicación. Si el navegador te lo solicita, autorízaselo."
  }, 
  "map-error": {
    "message": "No se puede cargar Google Maps. Asegúrate de que la red esté operativa e intenta cargar la página de nuevo.<br/><br/>Puedes introducir códigos plus+code con o sin el prefijo y utilizar la brújula, pero no podrás introducir direcciones ni códigos plus+code con direcciones hasta que se muestren los mapas."
  }, 
  "osm-maps": {
    "message": "Open Street Map"
  }, 
  "ui-feedback": {
    "message": "Comentarios"
  }, 
  "ui-github": {
    "message": "Ver proyecto"
  }, 
  "ui-help": {
    "message": "Ayuda"
  }, 
  "ui-language": {
    "message": "Idioma"
  }, 
  "ui-satellite": {
    "message": "Satélite"
  }, 
  "units-km": {
    "message": "km"
  }, 
  "units-meters": {
    "message": "metros"
  }, 
  "waiting-for-compass-1": {
    "message": "Esperando la"
  }, 
  "waiting-for-compass-2": {
    "message": "lectura de la brújula"
  }, 
  "waiting-location": {
    "message": "Esperando ubicación..."
  }
}
LocalisedMessages["fr"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "Applications"
  }, 
  "bing-maps": {
    "message": "Bing Maps"
  }, 
  "browser-problem-msg": {
    "message": "Le navigateur que vous utilisez n'est pas compatible avec toutes les fonctionnalités dont nous avons besoin, comme la localisation et la boussole.<br/><br/>Nous vous recommandons de passer à Chrome, Firefox ou Opera."
  }, 
  "compass-check-fail-msg": {
    "message": "La boussole de votre appareil n'indique pas la direction. Il est possible que la boussole ne soit pas compatible avec votre appareil ou qu'elle ne fonctionne pas correctement."
  }, 
  "compass-check-msg": {
    "message": "Un problème est peut-être survenu lors de la lecture de la boussole.<br/><br/>Pour la tester, tenez votre appareil à l'horizontale et décrivez un cercle.<br/><br/>Lorsque vous avez fait un tour complet, appuyez sur le bouton ci-dessous."
  }, 
  "compass-check-ok": {
    "message": "La boussole de votre appareil semble fonctionner !"
  }, 
  "dismiss": {
    "message": "Ignorer"
  }, 
  "extend-failure-msg": {
    "message": "Pour localiser $OLC$, nous devons connaître votre position ou inclure une ville dans les données. <br/><br/>Vérifiez que le partage de position est autorisé dans votre navigateur et que les services de localisation sont activés sur votre appareil.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "Envoyez-nous vos commentaires. Dites-nous ce que vous appréciez. Expliquez-nous ce qui fonctionne mal et nous essaierons de l'améliorer."
  }, 
  "geocode-fail": {
    "message": "Le service d'adresse de Google ne parvient pas à localiser $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Impossible de localiser $ADDRESS$, car le service d'adresse de Google n'est pas chargé.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "Impossible d'obtenir des informations sur la localité (erreur du service de géocodage de Google)."
  }, 
  "geocoder-no-info": {
    "message": "Le service de géocodage de Google ne dispose pas d'informations de localisation dans cette zone. Vous pouvez essayer d'utiliser un code plus+code contenant le nom d'une grande ville, s'il y en a une dans un rayon de 40 km."
  }, 
  "google-maps": {
    "message": "Google Maps"
  }, 
  "help-01-0": {
    "message": "<h2>Votre code postal personnel</h2><p>Les codes plus+code sont des codes courts qui désignent un lieu précis. Vous pouvez utiliser ces codes pour guider d'autres personnes vers votre position exacte, de façon rapide et fiable.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>Qu'est-ce qu'un code plus+code ?</h2><p>Il s'agit d'un code court composé de six ou sept lettres et chiffres, comme <b>$EXAMPLE_CODE$</b>. Il peut être associé à une ville, par exemple : <b>$EXAMPLE_CODE$ Nairobi</b>.</p><p>Il permet d'indiquer une position exacte, sans recourir aux noms de rues ni aux numéros de bâtiment.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>Comment puis-je trouver le lieu désigné par un code plus+code ?</h2><p>Lorsque vous saisissez un code plus+code (<b>$EXAMPLE_CODE$</b>) sur votre téléphone ou ordinateur, celui-ci affiche la correspondance la plus proche. Si vous vous situez dans un rayon d'environ 40 kilomètres autour de ce lieu, le lieu exact s'affichera.</p><p>Si vous en êtes plus éloigné, ajoutez le nom de la ville (<b>$EXAMPLE_CODE$ Nairobi</b>), ou saisissez le code plus+code accompagné du code de région (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>Dois-je faire une demande pour obtenir un code plus+code ?</h2><p>Non. Tous les lieux sont déjà associés à un code plus+code, que tout le monde peut utiliser gratuitement.</p><p>Pour connaître le code plus+code d'un lieu, il suffit de faire glisser la carte pour le mettre en évidence.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>De quoi le code se compose-t-il ?</h2><p>Dans notre exemple, <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> est le code de la région (environ 100 x 100 kilomètres), <b>$CODE_PART_2$</b> le code de la ville (5 x 5 kilomètres) et <b>$CODE_PART_3$</b> le code du quartier (250 x 250 mètres). Après le signe <b>+</b>, <b>$CODE_PART_4$</b> correspond au code du bâtiment (14 x 14 mètres). Il peut être suivi d'un code de porte à un chiffre, si le code du bâtiment correspond à plusieurs bâtiments.</p><p>Le code de région n'est généralement pas nécessaire. Celui de la ville peut parfois être omis également.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>Un lieu peut-il posséder plusieurs codes plus+code ?</h2><p>Non. Un lieu donné ne peut être associé qu'à un seul code plus+code.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>Puis-je enregistrer les codes ?</h2><p>Pour enregistrer un code plus+code, il vous suffit d'ajouter la page à vos favoris. Le lieu s'affichera lorsque vous ouvrirez la page.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>Puis-je utiliser cette fonctionnalité lorsque je n'ai pas de réseau ?</h2><p>Oui ! Une fois que vous chargé la page sur votre téléphone ou votre ordinateur, celui-ci en garde une copie à laquelle vous pouvez accéder même hors connexion.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>Puis-je obtenir un itinéraire ?</h2><p>Un mode boussole vous indique la direction et la distance qui vous sépare du lieu désigné par le code plus+code. Le menu principal contient des liens vers différents fournisseurs de cartes que vous pouvez utiliser.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>La zone indiquée par mon code plus+code est trop grande !</h2><p>Effectuez un zoom avant pour obtenir un code correspondant à une zone plus réduite.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>L'adresse affichée est erronée !</h2><p>L'adresse fournie n'est qu'une simple suggestion. Elle sert à réduire la longueur du code que vous devez utiliser. Vous pouvez essayer de saisir d'autres adresses dans le champ de recherche.</p>"
  }, 
  "input-prompt": {
    "message": "Saisissez un code plus+code, une adresse ou faites glisser la carte"
  }, 
  "location-prompt": {
    "message": "Ce service doit connaître votre position. Autorisez le partage de votre position si vous y êtes invité par votre navigateur."
  }, 
  "map-error": {
    "message": "Impossible d'ouvrir Google Maps. Vérifiez que votre réseau fonctionne et réessayez de charger la page.<br/><br/>Tant que Google Maps n'est pas affiché, vous pouvez saisir des codes plus+code avec ou sans code de région, et utiliser la boussole. En revanche, vous ne pouvez pas saisir d'adresses, ni saisir de codes plus+code avec adresse."
  }, 
  "osm-maps": {
    "message": "Open Street Map"
  }, 
  "ui-feedback": {
    "message": "Commentaires"
  }, 
  "ui-github": {
    "message": "Afficher le projet"
  }, 
  "ui-help": {
    "message": "Aide"
  }, 
  "ui-language": {
    "message": "Langue"
  }, 
  "ui-satellite": {
    "message": "Satellite"
  }, 
  "units-km": {
    "message": "km"
  }, 
  "units-meters": {
    "message": "mètres"
  }, 
  "waiting-for-compass-1": {
    "message": "En attente d'une"
  }, 
  "waiting-for-compass-2": {
    "message": "indication de la boussole"
  }, 
  "waiting-location": {
    "message": "En attente d'informations de localisation…"
  }
}
LocalisedMessages["hi"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "ऐप्लिकेशन"
  }, 
  "bing-maps": {
    "message": "Bing Maps"
  }, 
  "browser-problem-msg": {
    "message": "आप जिस ब्राउज़र का उपयोग कर रहे हैं, वह हमारे लिए आवश्यक सभी सुविधाओं का समर्थन नहीं करता, जैसे स्थान और कंपास.<br/><br/>हम Chrome, Firefox या Opera का उपयोग करने का सुझाव देते हैं."
  }, 
  "compass-check-fail-msg": {
    "message": "आपके डिवाइस का कंपास दिशा निर्देश की रिपोर्टिंग नहीं कर रहा है. शायद आपका डिवाइस कंपास का समर्थन नहीं कर रहा है या शायद वह यह ठीक से काम नहीं कर रहा है."
  }, 
  "compass-check-msg": {
    "message": "कंपास को पढ़ने में समस्या हो सकती है.<br/><br/>इसका परीक्षण करने के लिए, अपने डिवाइस को अपने हाथ में समतल स्थिति में पकड़ें और उसे वृत्ताकार तरीके से घुमाएं.<br/><br/>पूरा घुमाने के बाद, नीचे दिए गए बटन पर टैप करें."
  }, 
  "compass-check-ok": {
    "message": "आपके डिवाइस का कंपास ठीक लग रहा है!"
  }, 
  "dismiss": {
    "message": "ख़ारिज करें"
  }, 
  "extend-failure-msg": {
    "message": "$OLC$ का पता लगाने के लिए, हमें आपके मौजूदा स्थान की आवश्यकता होगी या आपको जानकारी में कोई कस्बा या शहर शामिल करना होगा.<br/><br/>जांच करें कि आपका ब्राउज़र स्थान को अनुमति दे रहा है और आपके डिवाइस पर स्थान सेवाएं सक्षम हैं.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "फ़ीडबैक भेजें. हमें बताएं कि आप क्या पसंद करते हैं या कौन सी चीज़ें कारगर नहीं हैं और हम उनमें सुधार करने का प्रयास करेंगे."
  }, 
  "geocode-fail": {
    "message": "Google की पता सेवा $ADDRESS$ का पता नही लगा सकती.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Google की पता सेवा लोड नहीं हुई, $ADDRESS$ का पता नहीं लगा सकते.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "किसी स्थान की जानकारी नहीं मिली (Google की जियोकोडर सेवा में कोई त्रुटि थी)"
  }, 
  "geocoder-no-info": {
    "message": "Google की जियोकोडर सेवा के पास इस क्षेत्र की पता जानकारी नहीं है. आप किसी बड़े कस्बे के साथ प्लस+कोड का उपयोग कर सकते हैं, बशर्ते 40किमी के दायरे में कोई बड़ा कस्बा हो."
  }, 
  "google-maps": {
    "message": "Google मानचित्र"
  }, 
  "help-01-0": {
    "message": "<h2>आपके अपने पोस्टकोड</h2><p>प्लस+कोड कहीं भी, किसी भी स्थान के संक्षिप्त कोड होते हैं. आप उनका उपयोग करके लोगों को अपने सटीक स्थान पर जल्द और भरोसे के साथ भेजने के लिए मार्गदर्शन कर सकते हैं.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>प्लस+कोड क्या है?</h2><p>प्लस+कोड छः या सात अक्षरों और संख्याओं के बना एक संक्षिप्त कोड होता है, जैसे <b>$EXAMPLE_CODE$</b>, या वह किसी कस्बे या शहर से संयोजित होता है, जैसे<b>$EXAMPLE_CODE$ नैरोबी</b>.</p><p>वे व्यक्ति को किसी ऐसे स्थान की सटीक जानकारी देते हैं, जो मार्ग के नाम या भवन संख्या पर निर्भर नहीं होता.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>मैं कैसे पता लगा सकता/सकती हूं कि प्लस+कोड कहां है?</h2><p>जब आप अपने फ़ोन का कंप्यूटर पर कोई प्लस कोड (<b>$EXAMPLE_CODE$</b>) डालते हैं, तो वह नज़दीकी मिलान खोज लेगा. इसके परिणामस्वरूप, आपको मौजूदा स्थान की जानकारी प्राप्त होगी, बशर्ते आप उस स्थान के लगभग 40 किलोमीटर के दायरे में हों.</p><p>यदि आप और दूर चले जाते हैं तो कस्बे या शहर के नाम (<b>$EXAMPLE_CODE$ नैरोबी</b>) का उपयोग करें या क्षेत्र कोड (<b>$FULL_CODE$</b>) शामिल करके प्लस+कोड डालें.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>क्या मुझे प्लस+कोड के लिए आवेदन करना होगा?</h2><p>नहीं, प्लस+कोड सभी के लिए पहले से उपलब्ध हैं और कोई भी उनका निःशुल्क उपयोग कर सकता है.</p><p>किसी स्थान का प्लस+कोड प्राप्त करने के लिए बस मानचित्र को खींच कर अपना इच्छित स्थान हाइलाइट करें.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>कोड के विभिन्न हिस्से कौन-कौन से हैं?</h2><p>हमारे उदाहरण कोड के लिए <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> क्षेत्र कोड है (लगभग 100 x 100 किलोमीटर). <b>$CODE_PART_2$</b> शहर कोड है (5 x 5 किलोमीटर). <b>$CODE_PART_3$</b> पड़ोस का कोड है (250 x 250 मीटर). <b>+</b> के बाद, <b>$CODE_PART_4$</b> भवन का कोड है (14 x 14 मीटर). यदि भवन आकार कोड एक से अधिक भवनों से बढ़ जाता है तो उसके बाद एकल अंक का डोर कोड डाला जा सकता है. </p><p>आमतौर पर, क्षेत्र कोड की आवश्यकता नहीं पड़ती और कभी-कभी आप शहर कोड को भी छोड़ सकते हैं.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>क्या किसी स्थान पर एक से अधिक प्लस+कोड हैं?</h2><p>नहीं. हर स्थान पर केवल एक प्लस+कोड है.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>क्या मैं उन्हें सहेज सकता/सकती हूं?</h2><p>किसी प्लस+कोड को सहेजने के लिए, बस उस पृष्ठ का बुकमार्क बनाएं. जब आप बुकमार्क खोलेंगे, तो वह आपको वह स्थान दर्शाएगा.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>क्या मैं इसे नेटवर्क के बिना उपयोग कर सकता/सकती हूं?</h2><p>हां! जब आप अपने फ़ोन या कंप्यूटर पर इस पृष्ठ को लोड कर लेंगे, तो यह उसकी एक कॉपी बना लेगा और फिर आप किसी नेटवर्क कनेक्शन के बिना भी उसे लोड कर सकेंगे.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>क्या मुझे दिशा निर्देश प्राप्त हो सकते हैं?</h2><p>एक कंपास मोड आपके स्थान से मौजूदा प्लस+कोड तक पहुंचने की दिशा और दूरी की जानकारी प्रदान करता है. मुख्य मेनू में विभिन्न मानचित्र प्रदाताओं के लिंक होते हैं, जिन्हें आप उपयोग कर सकते हैं.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>मेरा प्लस+कोड क्षेत्र बहुत बड़ा है!</h2><p>यदि आप ज़ूम और बढ़ाते हैं तो कोड अपेक्षाकृत एक छोटा क्षेत्र दर्शाएगा.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>आपने जो पता दिखाया है, वह गलत है!</h2><p>दिया गया पता केवल एक सुझाव है. इसका उपयोग आपके द्वारा उपयोग किए जाने वाले कोड की लंबाई कम करने के लिए किया जाता है. आप खोज बॉक्स में अन्य पते आज़मा सकते हैं.</p>"
  }, 
  "input-prompt": {
    "message": "कोई प्लस+कोड, पता डालें या मानचित्र खींचें"
  }, 
  "location-prompt": {
    "message": "यह सेवा आपके स्थान का उपयोग करती है. यदि आपका ब्राउज़र पूछे तो कृपया इसे अनुमति दें."
  }, 
  "map-error": {
    "message": "Google मानचित्र लोड नहीं कर सकते. सुनिश्चित करें कि आपका नेटवर्क कार्य कर रहा है और पृष्ठ पुनः लोड करें.<br/><br/>आप क्षेत्र कोड के साथ या उसके बिना प्लस+कोड डाल सकते हैं और कंपास का उपयोग कर सकते हैं, लेकिन आप मानचित्रों के प्रदर्शित होने तक पते या पतों के साथ प्लस+कोड नहीं डाल पाएंगे."
  }, 
  "osm-maps": {
    "message": "ओपन स्ट्रीट मानचित्र"
  }, 
  "ui-feedback": {
    "message": "फ़ीडबैक"
  }, 
  "ui-github": {
    "message": "प्रोजेक्ट देखें"
  }, 
  "ui-help": {
    "message": "सहायता"
  }, 
  "ui-language": {
    "message": "भाषा"
  }, 
  "ui-satellite": {
    "message": "उपग्रह"
  }, 
  "units-km": {
    "message": "किमी"
  }, 
  "units-meters": {
    "message": "मीटर"
  }, 
  "waiting-for-compass-1": {
    "message": "इसकी प्रतीक्षा करें"
  }, 
  "waiting-for-compass-2": {
    "message": "कंपास रीडिंग"
  }, 
  "waiting-location": {
    "message": "स्थान की प्रतीक्षा की जा रही है..."
  }
}
LocalisedMessages["id"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "Aplikasi"
  }, 
  "bing-maps": {
    "message": "Bing Maps"
  }, 
  "browser-problem-msg": {
    "message": "Browser yang Anda gunakan tidak mendukung semua fitur yang kami butuhkan, seperti lokasi dan kompas.<br/><br/>Sebaiknya gunakan Chrome, Firefox, atau Opera."
  }, 
  "compass-check-fail-msg": {
    "message": "Kompas pada perangkat Anda tidak melaporkan arah. Kompas mungkin tidak didukung oleh perangkat Anda, atau mungkin tidak berfungsi dengan baik."
  }, 
  "compass-check-msg": {
    "message": "Mungkin terjadi masalah dalam membaca kompas.<br/><br/>Untuk mengujinya, pegang perangkat dalam posisi datar dan putar membentuk lingkaran.<br/><br/>Setelah memutar penuh, ketuk tombol di bawah."
  }, 
  "compass-check-ok": {
    "message": "Kompas pada perangkat Anda tampak tidak bermasalah!"
  }, 
  "dismiss": {
    "message": "Tutup"
  }, 
  "extend-failure-msg": {
    "message": "Untuk mencari tahu lokasi $OLC$, kami perlu mengetahui lokasi Anda saat ini, atau Anda harus mencantumkan kota pada informasi.<br/><br/>Pastikan browser Anda mengizinkan lokasi, dan layanan lokasi diaktifkan pada perangkat Anda.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "Kirim masukan. Beri tahu kami apa yang Anda suka, atau apa yang tidak berfungsi dan kami akan berusaha untuk memperbaikinya."
  }, 
  "geocode-fail": {
    "message": "Layanan alamat Google tidak dapat menemukan $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Layanan alamat Google tidak dimuat, tidak dapat menemukan $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "Tidak bisa mendapatkan informasi lokalitas (terdapat kesalahan pada layanan geocoder Google)"
  }, 
  "geocoder-no-info": {
    "message": "Layanan geocoder Google tidak memiliki informasi alamat di area ini. Anda mungkin dapat menggunakan plus+code dengan nama kota besar, jika ada kota dalam jarak 40 km."
  }, 
  "google-maps": {
    "message": "Google Maps"
  }, 
  "help-01-0": {
    "message": "<h2>Kode pos pribadi Anda</h2><p>plus+code merupakan kode singkat untuk setiap lokasi, di mana pun. Anda dapat menggunakannya untuk memandu orang ke lokasi tepat Anda, dengan cepat dan dapat diandalkan.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>Apa itu plus+code?</h2><p>Plus+code merupakan kode singkat yang terdiri dari 6 atau 7 huruf dan angka, seperti <b>$EXAMPLE_CODE$</b>, atau dikombinasikan dengan kota seperti ini <b>$EXAMPLE_CODE$ Nairobi</b>.</p><p>Dengan ini, Anda dapat memberi seseorang lokasi yang tepat yang tidak bergantung pada nama jalan atau nomor gedung.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>Bagaimana cara mengetahui letak plus+code?</h2><p>Ketika Anda memasukkan plus+code (<b>$EXAMPLE_CODE$</b>) pada ponsel atau komputer, plus+code akan menemukan kecocokan terdekat. Ini akan mengembalikan lokasi yang tepat selama Anda berada dalam jarak sekitar 40 kilometer dari lokasi.</p><p>Jika Anda lebih jauh, gunakan nama kota (<b>$EXAMPLE_CODE$ Nairobi</b>), atau masukkan plus+code termasuk kode wilayah (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>Apakah saya perlu mengajukan permohonan untuk mendapatkan plus+code?</h2><p>Tidak, plus+code sudah ada di mana-mana dan setiap orang dapat menggunakannya secara gratis.</p><p>Untuk mendapatkan plus+code suatu tempat, cukup seret peta untuk menyoroti tempat yang Anda inginkan.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>Apa saja bagian dari kode?</h2><p>Untuk contoh kode kami <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> adalah kode wilayah (kira-kira 100 x 100 kilometer). <b>$CODE_PART_2$</b> adalah kode kota (5 x 5 kilometer). <b>$CODE_PART_3$</b> adalah kode lingkungan (250 x 250 meter). Setelah <b>+</b>, <b>$CODE_PART_4$</b> adalah kode gedung (14 x 14 meter). Kode ini dapat diikuti dengan satu digit kode pintu, apabila kode ukuran gedung diperpanjang lebih dari satu gedung.</p><p>Biasanya, kode wilayah tidak diperlukan, dan terkadang Anda juga dapat meletakkan kode kota.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>Apakah lokasi memiliki lebih dari satu plus+code?</h2><p>Tidak. Setiap tempat hanya memiliki satu plus+code.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>Dapatkah disimpan?</h2><p>Untuk menyimpan plus+code, cukup buat bookmark untuk laman tersebut. Ketika Anda membuka bookmark, tempat akan ditunjukkan.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>Dapatkah saya menggunakannya pada saat tidak tersambung ke jaringan?</h2><p>Ya! Setelah laman ini dimuat pada ponsel atau komputer Anda, salinan akan disimpan dan Anda dapat memuatnya tanpa harus tersambung ke jaringan internet.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>Bisakah saya mendapatkan petunjuk arah?</h2><p>Terdapat mode kompas yang menunjukkan arah dan jarak dari posisi Anda ke plus+code saat ini. Menu utama memiliki tautan ke berbagai penyedia peta yang dapat Anda gunakan.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>Area plus+code saya terlalu besar!</h2><p>Jika Anda memperbesar lebih lanjut, kode akan ditujukan untuk area yang lebih kecil.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>Alamat yang Anda tunjukkan salah!</h2><p>Alamat yang diberikan hanya saran. Ini digunakan untuk mengurangi panjang kode yang perlu digunakan. Anda dapat mencoba alamat lain di kotak telusur.</p>"
  }, 
  "input-prompt": {
    "message": "Masukkan plus+code, alamat, atau seret peta"
  }, 
  "location-prompt": {
    "message": "Layanan ini perlu menggunakan lokasi Anda. Jika browser meminta, izinkan."
  }, 
  "map-error": {
    "message": "Google Maps tidak dapat dimuat. Pastikan jaringan Anda berfungsi dan coba muat ulang laman.<br/><br/>Anda dapat memasukkan plus+code dengan atau tanpa kode area, dan menggunakan kompas, namun Anda tidak dapat memasukkan alamat, atau plus+code dengan alamat, sampai peta ditampilkan."
  }, 
  "osm-maps": {
    "message": "Open Street Map"
  }, 
  "ui-feedback": {
    "message": "Masukan"
  }, 
  "ui-github": {
    "message": "Lihat proyek"
  }, 
  "ui-help": {
    "message": "Bantuan"
  }, 
  "ui-language": {
    "message": "Bahasa"
  }, 
  "ui-satellite": {
    "message": "Satelit"
  }, 
  "units-km": {
    "message": "km"
  }, 
  "units-meters": {
    "message": "meter"
  }, 
  "waiting-for-compass-1": {
    "message": "Menunggu"
  }, 
  "waiting-for-compass-2": {
    "message": "membaca kompas"
  }, 
  "waiting-location": {
    "message": "Menunggu lokasi..."
  }
}
LocalisedMessages["pt-BR"] = {
  "apple-maps": {
    "message": "Mapas da Apple"
  }, 
  "apps": {
    "message": "Aplicativos"
  }, 
  "bing-maps": {
    "message": "Mapas do Bing"
  }, 
  "browser-problem-msg": {
    "message": "O navegador que você está usando não suporta todos os recursos necessários, como local e bússola.<br/><br/>Recomendamos o uso do Chrome, Firefox ou Opera."
  }, 
  "compass-check-fail-msg": {
    "message": "A bússola do seu dispositivo não está indicando a direção. Não há suporte para a bússola no seu dispositivo ou ela não está funcionando corretamente."
  }, 
  "compass-check-msg": {
    "message": "Pode haver um problema na bússola.<br/><br/>Para testá-la, mantenha seu dispositivo na horizontal e gire seu corpo 360° no próprio eixo.<br/><br/>Quando terminar a volta, toque no botão abaixo."
  }, 
  "compass-check-ok": {
    "message": "A bússola do seu dispositivo parece estar funcionando."
  }, 
  "dismiss": {
    "message": "Dispensar"
  }, 
  "extend-failure-msg": {
    "message": "Para identificar onde $OLC$ fica, precisamos do seu local atual ou você precisa incluir uma cidade na informação.<br/><br/>Verifique se seu navegador permite a localização e se os serviços de localização estão ativados no seu dispositivo.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "Envie comentários. Conte-nos do que você gosta ou o que não funciona bem e tentaremos melhorar."
  }, 
  "geocode-fail": {
    "message": "O serviço de endereços do Google não conseguiu localizar $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "O serviço de endereços do Google não foi carregado, não é possível localizar $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "Não foi possível obter informações da localidade (erro no serviço de geocódigos do Google)"
  }, 
  "geocoder-no-info": {
    "message": "O serviço de geocódigos do Google não tem informações de endereço nessa área. Você pode usar um código plus+ com o nome de uma cidade grande se houver uma no raio de 40 km"
  }, 
  "google-maps": {
    "message": "Google Maps"
  }, 
  "help-01-0": {
    "message": "<h2>Seu próprio código postal pessoal</h2><p>Os códigos plus+ são códigos curtos para qualquer local, em todos os lugares. Use-os para guiar as pessoas até sua localização exata de forma rápida e confiável.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>O que é um código plus+?</h2><p>O código plus+ é um código curto composto de seis ou sete letras e números, como <b>$EXAMPLE_CODE$</b>, ou combinado com uma cidade, como este <b>$EXAMPLE_CODE$ Nairobi</b>.</p><p>Com eles, você fornece a alguém um local exato que não depende de nomes de rua ou de números de prédios.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>Como localizo um código plus+?</h2><p>Quando você insere um código plus+ (<b>$EXAMPLE_CODE$</b>) no seu celular ou computador, ele encontra a correspondência mais próxima. O local correto será retornado se você estiver a menos de 40 quilômetros dele.</p><p>Caso esteja mais distante do que isso, use o nome da cidade (<b>$EXAMPLE_CODE$ Nairobi</b>) ou insira o código plus+ com o código da região (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>Eu preciso solicitar um código plus+?</h2><p>Não, os códigos plus+ já existem em qualquer lugar e todos podem usá-los de graça.</p><p>Para ver o código plus+ de um lugar, basta arrastar o mapa para destacar o local desejado.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>Quais são as partes do código?</h2><p>No nosso exemplo de código <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> é o código da região (aproximadamente 100 x 100 quilômetros). <b>$CODE_PART_2$</b> é o código da cidade (5 x 5 quilômetros). <b>$CODE_PART_3$</b> é o código da vizinhança (250 x 250 metros). Depois de <b>+</b>, <b>$CODE_PART_4$</b> é o código do prédio (14 x 14 metros). Ele pode ser seguido por um código de porta de um dígito, caso o código do tamanho do prédio englobe mais de um prédio.</p><p>Geralmente, o código da região não é necessário, e algumas vezes você também não precisará do código da cidade.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>Um local tem mais de um código plus+?</h2><p>Não. Todos os locais têm apenas um código plus+.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>Posso salvá-los?</h2><p>Para salvar um código plus+, basta adicionar a página aos favoritos. O local será exibido quando você abrir o favorito.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>Posso usar esse recurso quando não há rede?</h2><p>Sim. Depois que você carrega essa página no seu telefone ou computador, ele mantém uma cópia e permite que ela seja carregada mesmo sem uma conexão de rede.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>Posso ver a rota?</h2><p>Há um modo de bússola que mostra a rota e a distância de onde você está até o código plus+ atual. No menu principal, você encontra links para provedores de mapas diferentes disponíveis para usar.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>Minha área do código plus+ é muito grande.</h2><p> Se você aumentar o zoom, o código será para uma área menor.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>O endereço que você mostrou está errado.</h2><p>O endereço fornecido é apenas uma sugestão. Ele é usado para reduzir o comprimento do código que você precisa usar. Tente inserir outros endereços na caixa de pesquisa.</p>"
  }, 
  "input-prompt": {
    "message": "Insira um código plus+, um endereço ou arraste o mapa"
  }, 
  "location-prompt": {
    "message": "Este serviço precisa usar seu local. Dê permissão caso seja solicitado pelo navegador."
  }, 
  "map-error": {
    "message": "Não foi possível carregar o Google Maps. Verifique se a rede está funcionando e tente recarregar a página.<br/><br/>Insira os códigos plus+ com ou sem o código de área e use a bússola. No entanto, você só poderá inserir endereços ou códigos plus+ com endereços quando os mapas forem exibidos."
  }, 
  "osm-maps": {
    "message": "Abrir mapa da rua"
  }, 
  "ui-feedback": {
    "message": "Comentários"
  }, 
  "ui-github": {
    "message": "Visualizar projeto"
  }, 
  "ui-help": {
    "message": "Ajuda"
  }, 
  "ui-language": {
    "message": "Idioma"
  }, 
  "ui-satellite": {
    "message": "Satélite"
  }, 
  "units-km": {
    "message": "km"
  }, 
  "units-meters": {
    "message": "metros"
  }, 
  "waiting-for-compass-1": {
    "message": "Aguardando"
  }, 
  "waiting-for-compass-2": {
    "message": "leitura da bússola"
  }, 
  "waiting-location": {
    "message": "Esperando local..."
  }
}
// Although this is pt-PT, save it as pt so it works for browsers whose language setting is either pt-PT and pt.
LocalisedMessages["pt"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "Aplicações"
  }, 
  "bing-maps": {
    "message": "Bing Maps"
  }, 
  "browser-problem-msg": {
    "message": "O navegador utilizado não suporta todas as funcionalidades de que precisamos, como a localização e a bússola.<br/><br/>Recomendamos a utilização do Chrome, do Firefox ou do Opera."
  }, 
  "compass-check-fail-msg": {
    "message": "A bússola do seu dispositivo não está a indicar a direção. É possível que o dispositivo não suporte a bússola ou que esta não esteja a funcionar corretamente."
  }, 
  "compass-check-msg": {
    "message": "Poderá ocorrer um problema com a leitura da bússola.<br/><br/>Para testá-la, segure o dispositivo na horizontal e rode-o perfazendo um círculo.<br/><br/>Após rodá-lo completamente, toque no botão abaixo."
  }, 
  "compass-check-ok": {
    "message": "A bússola do seu dispositivo parece estar a funcionar."
  }, 
  "dismiss": {
    "message": "Ignorar"
  }, 
  "extend-failure-msg": {
    "message": "Para determinar onde fica $OLC$, precisamos que nos forneça a sua localização atual ou que inclua uma localidade ou cidade nas informações.<br/><br/>Confirme se o seu navegador está a permitir o acesso à localização e se os serviços de localização estão ativados no seu dispositivo.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "Envie comentários. Diga-nos do que gosta e o que não está a funcionar, para tentarmos melhorar esses aspetos."
  }, 
  "geocode-fail": {
    "message": "O serviço de endereços da Google não consegue localizar $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "O serviço de endereços da Google não foi carregado, pelo que não é possível localizar $ADDRESS$.", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "Não foi possível obter informações de localidade (ocorreu um erro com o serviço geocodificador da Google)"
  }, 
  "geocoder-no-info": {
    "message": "O serviço geocodificador da Google não possui informações de endereço nesta área. Poderá conseguir utilizar um código+ com o nome de uma cidade grande, se houver uma num raio de 40 km."
  }, 
  "google-maps": {
    "message": "Google Maps"
  }, 
  "help-01-0": {
    "message": "<h2>Os seus códigos+ de código postal pessoais</h2><p> são códigos curtos para qualquer localização, em qualquer lugar. Pode utilizá-los para ajudar as pessoas a encontrarem a sua localização exata de uma forma rápida e fiável.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>O que é um código+?</h2><p>Um código+ é um código curto composto por seis ou sete letras e números, como <b>$EXAMPLE_CODE$</b>, ou com uma combinação de uma localidade ou cidade como <b>$EXAMPLE_CODE$ Nairobi</b>.</p><p>Este código permite-lhe dar a alguém uma localização exata que não depende de nomes de rua ou números de edifícios.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>Como descubro onde fica um código+?</h2><p>Quando introduz um código+(<b>$EXAMPLE_CODE$</b>) no seu telemóvel ou no computador, este vai encontrar a correspondência mais próxima. Vai devolver a localização correta, desde que esteja a cerca de 40 quilómetros do local.</p><p>Se estiver mais distante, utilize o nome da localidade ou da cidade (<b>$EXAMPLE_CODE$ Nairobi</b>), ou introduza o código+ incluindo o código da região (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>Preciso de me candidatar à obtenção de um código+?</h2><p>Não, os códigos+ já estão disponíveis e qualquer pessoa pode utilizá-los gratuitamente.</p><p>Para obter o código+ para um local, basta arrastar o mapa para realçar o local pretendido.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>Quais são os elementos do código?</h2><p>No nosso código de exemplo <b>$FULL_CODE$</b>, <b>$CODE_PART_1$</b> é o código da região (cerca de 100 x 100 quilómetros). <b>$CODE_PART_2$</b> é o código da cidade (5 x 5 quilómetros). <b>$CODE_PART_3$</b> é o código da vizinhança (250 x 250 metros). A seguir ao <b>+</b>, vem <b>$CODE_PART_4$</b> que é o código do edifício (14 x 14 metros). Pode ser seguido de um código de porta de um só dígito, se o código do edifício abranger mais de um edifício.</p><p>Normalmente, o código da região não é necessário e, por vezes, também pode ignorar o código da cidade.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>Uma localização pode ter mais de um código+?</h2><p>Não. Qualquer local tem apenas um código+.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>Posso guardá-lo?</h2><p>Para guardar um código+, basta criar um marcador para a página. Quando abrir o marcador, este vai mostrar o local.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>Posso utilizá-lo quando não tiver rede?</h2><p>Sim. Após carregar esta página no seu telemóvel ou no computador, é criada uma cópia da página, a qual vai poder carregar mesmo que não tenha ligação à rede.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>Posso obter direções?</h2><p>Existe um modo de bússola que lhe mostra a direção e a distância de onde está em relação ao código+ atual. O menu principal tem links para os diferentes fornecedores de mapas que pode utilizar.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>A área do meu código+ é demasiado grande.</h2><p>Se aumentar mais o zoom, a área do código fica mais pequena.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>O endereço mostrado está errado.</h2><p>O endereço fornecido é apenas uma sugestão. É utilizado para reduzir o comprimento do código que precisa de utilizar. Pode experimentar outros endereços na caixa de pesquisa.</p>"
  }, 
  "input-prompt": {
    "message": "Introduza um código+, um endereço ou arraste o mapa"
  }, 
  "location-prompt": {
    "message": "Este serviço precisa de utilizar a sua localização. Se o navegador lhe pedir acesso, autorize-o."
  }, 
  "map-error": {
    "message": "Não é possível carregar o Google Maps. Certifique-se de que tem uma rede a funcionar e experimente atualizar a página.<br/><br/>Pode introduzir os códigos+ com ou sem o indicativo e utilizar a bússola, mas só vai conseguir introduzir endereços ou códigos+ com endereços quando forem apresentados mapas."
  }, 
  "osm-maps": {
    "message": "Open Street Map"
  }, 
  "ui-feedback": {
    "message": "Comentários"
  }, 
  "ui-github": {
    "message": "Ver projeto"
  }, 
  "ui-help": {
    "message": "Ajuda"
  }, 
  "ui-language": {
    "message": "Idioma"
  }, 
  "ui-satellite": {
    "message": "Satélite"
  }, 
  "units-km": {
    "message": "km"
  }, 
  "units-meters": {
    "message": "metros"
  }, 
  "waiting-for-compass-1": {
    "message": "A aguardar a"
  }, 
  "waiting-for-compass-2": {
    "message": "leitura da bússola"
  }, 
  "waiting-location": {
    "message": "A aguardar localização..."
  }
}
LocalisedMessages["ru"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "Приложения"
  }, 
  "bing-maps": {
    "message": "Bing Maps"
  }, 
  "browser-problem-msg": {
    "message": "В вашем браузере не поддерживаются некоторые функции, такие как геолокация и компас.<br/><br/>Рекомендуем использовать Chrome, Firefox или Opera."
  }, 
  "compass-check-fail-msg": {
    "message": "Ваше устройство не передает данные о направлении. Возможно, компас на нем не установлен или работает некорректно."
  }, 
  "compass-check-msg": {
    "message": "Не удалось прочитать данные компаса.<br/><br/>Чтобы проверить его, разместите устройство горизонтально и поверните его по кругу.<br/><br/>Описав полный круг, нажмите кнопку ниже."
  }, 
  "compass-check-ok": {
    "message": "Компас на вашем устройстве работает корректно."
  }, 
  "dismiss": {
    "message": "Закрыть"
  }, 
  "extend-failure-msg": {
    "message": "Чтобы можно было определить, где находится объект \"$OLC$\", укажите город или предоставьте доступ к информации о вашем местоположении.<br/><br/>Убедитесь, что в вашем браузере разрешен этот доступ и на устройстве включена геолокация.", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "Расскажите нам, что вам нравится, а что требует доработки. Мы учтем ваши замечания."
  }, 
  "geocode-fail": {
    "message": "Не удается найти адрес \"$ADDRESS$\".", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Служба геолокации Google не загружена. Не удается найти адрес \"$ADDRESS$\".", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "Не удалось получить информацию о местоположении (произошла ошибка службы геокодирования Google)."
  }, 
  "geocoder-no-info": {
    "message": "В службе геокодирования Google нет информации об адресах из этой области. Если на расстоянии 40 км от вас есть большой город, используйте +код с его названием."
  }, 
  "google-maps": {
    "message": "Google Карты"
  }, 
  "help-01-0": {
    "message": "<h2>Ваш персональный индекс</h2><p>+Код – это короткий номер, присвоенный каждому местоположению. Он дает возможность с легкостью передавать другим пользователям точную информацию о каком-либо месте.</p>"
  }, 
  "help-02-0": {
    "message": "<h2>Что такое +код?</h2><p>Это небольшой фрагмент, состоящий из 6–7 букв или цифр, например <b>$EXAMPLE_CODE$</b>. Он также может указываться вместе с названием города: <b>$EXAMPLE_CODE$ Найроби</b>.</p><p>Этот код позволяет передавать точную информацию о местоположении без привязки к названию улицы или номеру дома.</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>Как узнать, с каким местом связан +код?</h2><p>Укажите +код (<b>$EXAMPLE_CODE$</b>) на своем телефоне или компьютере, и система найдет ближайшее соответствующее ему местоположение. Если оно находится в пределах 40 км от вас, на этом геолокация завершится.</p><p>Если место находится дальше, вам нужно будет добавить название города (<b>$EXAMPLE_CODE$ Найроби</b>) или указать +код с кодом области (<b>$FULL_CODE$</b>).</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>Нужно ли запрашивать +код?</h2><p>Нет. +Коды присвоены всем местоположениям и могут бесплатно использоваться любым участником.</p><p>Чтобы получить +код, выделите нужное место, перетащив карту.</p>"
  }, 
  "help-03-0": {
    "message": "<h2>Какая информация указывается в коде?</h2><p>Рассмотрим пример кода: <b>$FULL_CODE$</b>. <b>$CODE_PART_1$</b> – код региона (примерно 100 x 100 км). <b>$CODE_PART_2$</b> – код города (5 x 5 км). <b>$CODE_PART_3$</b> – код микрорайона (250 x 250 м). После знака <b>+</b> указывается код дома – <b>$CODE_PART_4$</b> (14 x 14 м). Если код относится к нескольким зданиям, в конце может стоять код входа, состоящий из одной цифры.</p><p>Код региона, как правило, можно не указывать. Иногда можно обойтись и без кода города.</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>Может ли местоположение иметь несколько +кодов?</h2><p>Нет. Каждому местоположению присваивается только один +код.</p>"
  }, 
  "help-03-2": {
    "message": "<h2>Можно ли сохранить +код?</h2><p>Да. Нужно лишь добавить страницу в закладки, и вы всегда сможете просмотреть это место.</p>"
  }, 
  "help-03-3": {
    "message": "<h2>Можно ли просмотреть местоположение в офлайн-режиме?</h2><p>Да. После загрузки этой страницы на ваш телефон или компьютер создается копия, которую можно загружать и без подключения к сети.</p>"
  }, 
  "help-03-4": {
    "message": "<h2>Как проложить маршрут?</h2><p>Вы можете использовать режим компаса, чтобы узнать направление к месту с указанным +кодом и расстояние до него. В главном меню вы найдете ссылки на разные картографические сервисы.</p>"
  }, 
  "help-03-5": {
    "message": "<h2>+Коду соответствует слишком большая область!</h2><p>Если вы увеличите масштаб, область, соответствующая коду, уменьшится.</p>"
  }, 
  "help-03-6": {
    "message": "<h2>Показанный адрес неверен!</h2><p>Предложенный адрес может быть неточным. Он используется для сокращения длины кода. Попробуйте указать другой вариант в окне поиска.</p>"
  }, 
  "input-prompt": {
    "message": "Укажите +код или адрес либо перетащите карту"
  }, 
  "location-prompt": {
    "message": "Для этого сервиса требуется информация о вашем местоположении. Если браузер запрашивает ее, дайте разрешение."
  }, 
  "map-error": {
    "message": "Не удается загрузить Google Карты. Проверьте доступ к сети и перезагрузите страницу.<br/><br/>Вы можете указывать +коды с кодами областей или без них и использовать компас, однако вы не сможете указывать адреса и +коды с адресами, пока не отобразятся карты."
  }, 
  "osm-maps": {
    "message": "Open Street Map"
  }, 
  "ui-feedback": {
    "message": "Оставить отзыв"
  }, 
  "ui-github": {
    "message": "Просмотреть аккаунт"
  }, 
  "ui-help": {
    "message": "Справка"
  }, 
  "ui-language": {
    "message": "Язык"
  }, 
  "ui-satellite": {
    "message": "Спутник"
  }, 
  "units-km": {
    "message": "км"
  }, 
  "units-meters": {
    "message": "м"
  }, 
  "waiting-for-compass-1": {
    "message": "Получение"
  }, 
  "waiting-for-compass-2": {
    "message": "данных компаса"
  }, 
  "waiting-location": {
    "message": "Определение местоположения..."
  }
}
LocalisedMessages["ur"] = {
  "apple-maps": {
    "message": "Apple Maps"
  }, 
  "apps": {
    "message": "ایپس"
  }, 
  "bing-maps": {
    "message": "بِنگ نقشے"
  }, 
  "browser-problem-msg": {
    "message": "آپ جو براؤزر استہمال کر رہے ہیں، وہ ہمارے لئے ضروری تمام خصوصیات کا تعاون نہیں کرتا، جیسے مقام اور قطب نما۔<br/><br/>ہم Chrome، Firefox، یا Opera کا استعمال کرنے کا مشورہ دیتے ہیں۔"
  }, 
  "compass-check-fail-msg": {
    "message": "آپ کے آلے کا قطب نما سمت کی اطلاع نہیں دے رہا ہے۔ عین ممکن ہے کہ آپ کا آلہ قطب نما کا تعاون نہ کر رہا ہو یا وہ اچھی طرح کام نہ کر رہا ہو۔"
  }, 
  "compass-check-msg": {
    "message": "قطب نما کو پڑھنے میں مسئلہ پیش آ سکتا ہے۔<br/><br/>اس کی جانچ کرنے کے لئے، اپنے آلے کو مسطح انداز میں پکڑیں اور اسے دائرے میں گھمائیں۔<br/><br/>مکمل طور پر گھمانے کے بعد، نیچے دیے گئے بٹن کو تھپتھپائیں۔"
  }, 
  "compass-check-ok": {
    "message": "آپ کے آلے کا قطب نما ٹھیک لگ رہا ہے!"
  }, 
  "dismiss": {
    "message": "برخاست کریں"
  }, 
  "extend-failure-msg": {
    "message": "$OLC$ کا پتہ لگانے کے لئے، ہمیں آپ کے موجودہ مقام کی ضرورت ہوگی، یا آپ کو معلومات میں کوئی قصبہ یا شہر شامل کرنا ہوگا۔ <br/><br/>جانچ کرلیں کہ آپ کا براؤزر مقام کو اجازت دے رہا ہے، اور مقام کی وہ سروسز آپ کے آلے پر فعال ہیں۔", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "تاثرات بھیجیں۔ ہمیں بتائیں کہ آپ کیا پسند کرتے ہیں یا کون سی چیز کارگر نہیں ہے اور ہم انہیں بہتر بنانے کی کوشش کریں گے۔"
  }, 
  "geocode-fail": {
    "message": "Google پتہ سروس $ADDRESS$ تلاش نہیں کر ستکا۔", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Google پتہ سروس لوڈ نہیں ہے، $ADDRESS$ تلاش نہیں کر سکتا۔", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "کوئی بھی علاقائی معلومات حاصل نہیں کر سکا (Google کی جیو کوڈر سروس میں ایک خرابی تھی)"
  }, 
  "geocoder-no-info": {
    "message": "Google کی جیو کوڈر سروس کے پاس اس علاقے کے پتے کی معلومات نہیں ہے۔ آپ کسی بڑے قصبے کے نام کے ساتھ پلس+کوڈ کا استعمال کر سکتے ہیں، بشرطیکہ 40 کلومیٹر کے دائرے میں کوئی بڑا قصبہ موجود ہو۔"
  }, 
  "google-maps": {
    "message": "Google Maps"
  }, 
  "help-01-0": {
    "message": "<h2>آپ کا ذاتی پوسٹ کوڈ</h2><p>پلس+کوڈ کہیں بھی، کسی بھی جگہ کے مختصر کوڈ ہیں۔ آپ ان کا استعمال کر کے لوگوں کی اپنے قطعی مقام کی جانب جلد اور اعتماد کےساتھ رہنمائی کر سکتے ہیں۔</p>"
  }, 
  "help-02-0": {
    "message": "<h2>پلس+کوڈ کیا ہے؟</h2><p>پلس+کوڈ چھ یا سات حروف اور اعداد سے بنا ایک مختصر کوڈ ہے، جیسے <b>$EXAMPLE_CODE$</b>، یا وہ کسی قصبے یا شہر کے ساتھ مشترک ہوتا ہے، جیسے <b>$EXAMPLE_CODE$نیروبی</b>۔</p><p>وہ آپ کو کسی ایسے مقام کی قطعی اطلاع دیتے ہیں جو سڑک کے ناموں یا عمارت کی تعداد پر منحصر نہیں ہوتا ہے۔</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>میں کیسے تلاش کروں کہ پلس+کوڈ کہاں ہے؟</h2><p>جب آپ اپنے فون یا کمپیوٹر پر کوئی پلس+کوڈ <b>$EXAMPLE_CODE$</b> درج کرتے ہیں، تو وہ قریب ترین مماتل تلاش کر لے گا۔ نتیجتاً، آپ کو موجودہ مقام کی معلومات حاصل ہوگی بشرطیکہ آپ اس مقام سے تقریباً 40 کلومیٹر کے دائرے میں ہوں۔</p><p>اگر آپ مزید دور ہیں، تو قصبے یا شہر کے نام (<b>$EXAMPLE_CODE$ نیروبی</b>) کا استعمال کریں، یا علاقے کا کوڈ (<b>$FULL_CODE$</b>) شامل کر کے پلس+کوڈ درج کریں۔</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>کیا مجھے پلس+کوڈ کے لئے درخواست دینی ہوگی؟</h2><p>نہیں، پلس+کوڈ پہلے ہی ہر جگہ موجود ہیں اور کوئی بھی ان کا مفت استعمال کر سکتا ہے۔</p><p>کسی جگہ کے لئے پلس+کوڈ حاصل کرنے کے لئے صرف نقشے کو کھینچ کر اپنا پسندیدہ جگہ کو نمایاں کریں۔</p>"
  }, 
  "help-03-0": {
    "message": "<h2>کوڈ کے مختلف حصے کون سے ہیں؟</h2><p>ہماری مثال کوڈ کے لئے <b>$FULL_CODE$</b>، <b>$CODE_PART_1$</b> علاقے کا کوڈ (تقریبا 100 × 100 کلومیٹر) ہے۔ <b>$CODE_PART_2$</b> شہر کوڈ (5×5 کلومیٹر) ہے۔ <b>$CODE_PART_3$</b> پڑوس کا کوڈ (250 × 250 میٹر) ہے۔ <b> + </b> کے بعد، <b>$CODE_PART_4$</b> عمارت کا کوڈ (14 × 14 میٹر) ہے۔ اگر عمارت کی سائز کا کوڈ ایک سے زیادہ عمارتوں سے بڑھ جاتا ہے، تو اس کے بعد واحد عددی ڈور کوڈ کی پیروی کی جا سکتی ہے۔</p><p>عام طور پر، علاقے کے کوڈ کی ضرورت نہیں ہوتی ہے، اور کبھی کبھار آپ شہر کے کوڈ کو بھی چھوڑ سکتے ہیں۔</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>کیا کسی مقام میں ایک سے زیادہ پلس+کوڈ ہے؟</h2><p>نہیں۔ ہر مقام پر صرف ایک پلس+کوڈ ہے۔</p>"
  }, 
  "help-03-2": {
    "message": "<h2>کیا میں انہیں محفوظ کر سکتا ہوں؟</h2><p>کسی پلس+کوڈ کو محفوظ کرنے کے لئے، صرف اس صفحے کا بُک مارک بنائیں۔ جب آپ بُک مارک کھولیں گے، تو وہ آپ کو وہ جگہ دکھائے گا۔</p>"
  }, 
  "help-03-3": {
    "message": "<h2>کیا میں نیٹ ورک کے بغیر اس کا استعمال کر سکتا ہوں؟</h2><p>ہاں! جب آپ اس صفحے کو اپنے فون یا کمپیوٹر پر لوڈ کر لیں گے، تو یہ اس کی ایک کاپی بنا لے گا اور پھر آپ کسی نیٹ ورک کنکشن کے بغیر بھی اسے لوڈ کر سکیں گے۔</p>"
  }, 
  "help-03-4": {
    "message": "<h2>کیا میں ڈائریکشنز حاصل کر سکتا ہوں؟</h2><p>ایک قطب نما موڈ آپ کے مقام سے موجودہ پلس+کوڈ تک پہنچنے کے سمت اور فاصلے کی معلومات فراہم کرتا ہے۔ مرکزی مینو میں مختلف نقشہ فراہم کنندگان کے لنکس ہوتے ہیں، جنہیں آپ استعمال کر سکتے ہیں۔</p>"
  }, 
  "help-03-5": {
    "message": "<h2>میرا پلس+کوڈ علاقہ بہت بڑا ہے!</h2><p>اگر آپ مزید زوم ان کرتے ہیں، تو کوڈ ایک نسبتاً چھوٹے علاقے کے لئے ہو جائے گا۔</p>"
  }, 
  "help-03-6": {
    "message": "<h2>آپ نے جو پتہ دکھایا ہے، وہ غلط ہے!</h2><p>دیا گیا پتہ صرف ایک تجویز ہے۔ اس کا استعمال آپ کے ذریعے استعمال کئے جانے والے کوڈ کی لمبائی کم کرنے کے لئے کیا جاتا ہے۔ آپ کو استعمال کرنی ہوگی۔ آپ تلاش کے خانے میں دیگر پتے آزما سکتے ہیں۔</p>"
  }, 
  "input-prompt": {
    "message": "کوئی پلس+کوڈ، پتہ درج کریں یا نقشہ کھینچیں"
  }, 
  "location-prompt": {
    "message": "اس سروس کو آپ کا مقام استعمال کرنے کی ضرورت ہے۔ اگر آپ کا براؤزر پوچھتا ہے، تو براہ کرم اسے اجازت دیں۔"
  }, 
  "map-error": {
    "message": "Google Maps لوڈ نہیں کر سکتے۔ یقینی بنائیں کہ آپ کا نیٹ ورک کام کر رہا ہے اور صفحے کو دوبارہ لوڈ کرنے کی کوشش کریں۔<br/><br/>آپ علاقے کے کوڈ کے ساتھ یا اس کے بغیر پلس+کوڈ درج کر سکتے ہیں، اور قطب نما کا استعمال کر سکتے ہیں، لیکن آپ نقشوں کو دکھائے جانے کا عمل جاری رہنے پتے، یا پتوں کے ساتھ پلس+کوڈ درج نہیں کر پائیں گے۔"
  }, 
  "osm-maps": {
    "message": "اوپن اسٹریٹ نقشہ"
  }, 
  "ui-feedback": {
    "message": "تاثرات"
  }, 
  "ui-github": {
    "message": "پروجیکٹ دیکھیں"
  }, 
  "ui-help": {
    "message": "مدد"
  }, 
  "ui-language": {
    "message": "زبان"
  }, 
  "ui-satellite": {
    "message": "سٹلائٹ"
  }, 
  "units-km": {
    "message": "کلومیٹر"
  }, 
  "units-meters": {
    "message": "میٹر"
  }, 
  "waiting-for-compass-1": {
    "message": "انتظار برائے"
  }, 
  "waiting-for-compass-2": {
    "message": "قطب نما پڑھنا"
  }, 
  "waiting-location": {
    "message": "مقام کا انتظار کر رہا ہے…"
  }
}
// Although this is zh-CN (Simplified Chinese), save it as zh so it works for browsers whose language setting is either zh, zh-CN, and zh-XX
// where we don't have messages for that language yet.
LocalisedMessages["zh"] = {
  "apple-maps": {
    "message": "Apple 地图"
  }, 
  "apps": {
    "message": "应用"
  }, 
  "bing-maps": {
    "message": "Bing 地图"
  }, 
  "browser-problem-msg": {
    "message": "您使用的浏览器无法支持我们需要的全部功能，例如位置信息和罗盘。<br/><br/>我们建议您使用 Chrome、Firefox 或 Opera 浏览器。"
  }, 
  "compass-check-fail-msg": {
    "message": "您设备上的罗盘并未报告方向。您的设备可能不支持此罗盘，或者罗盘的运行不正常。"
  }, 
  "compass-check-msg": {
    "message": "读取罗盘时可能出现了问题。<br/><br/>要测试其是否正常，请将设备拿稳放平并转一个圈。<br/><br/>转完一整圈后，请点按下面的按钮。"
  }, 
  "compass-check-ok": {
    "message": "您设备上的罗盘看起来正常！"
  }, 
  "dismiss": {
    "message": "关闭"
  }, 
  "extend-failure-msg": {
    "message": "为获取$OLC$的位置，我们需要使用您当前的位置信息，或者您可以在信息中加入城镇或城市。<br/><br/>请确保您的浏览器允许使用位置信息，而且您的设备启用了位置信息服务。", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "发送反馈意见。请告诉我们您喜欢哪些功能或者哪些功能还存在问题，我们将会做出相应的改进。"
  }, 
  "geocode-fail": {
    "message": "Google 的地址服务无法定位$ADDRESS$。", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Google 的地址服务未加载，无法定位$ADDRESS$。", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "无法获取任何位置信息（Google 的地理编码服务出现错误）"
  }, 
  "geocoder-no-info": {
    "message": "Google 的地理编码服务没有此区域的地址信息。如果方圆 40 公里之内有大城镇，那么您可以使用包含城镇名称的 plus+code。"
  }, 
  "google-maps": {
    "message": "Google 地图"
  }, 
  "help-01-0": {
    "message": "<h2>您的私人邮政编码</h2><p>plus+code 是一小段代码，可以代表任何地方、任何位置。借助这些代码，您可以快速、可靠地将他人引导至确切的位置。</p>"
  }, 
  "help-02-0": {
    "message": "<h2>什么是 plus+code？</h2><p>plus+code 是由 6 个或 7 个字母和数字组成的一小段代码（例如 <b>$EXAMPLE_CODE$</b>），或者是包含城镇或城市名称的代码组合（例如<b>$EXAMPLE_CODE$ Nairobi</b>）。</p><p>使用这样的代码，您无需依赖街道名称或建筑物名称即可向他人提供准确的地址。</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>如何找出 plus+code 所代表的位置？</h2><p>当您在手机或计算机上输入 plus+code (<b>$EXAMPLE_CODE$</b>) 时，系统会为您找出最近的匹配位置。只要您距离该位置在 40 公里之内，系统即会返回正确的位置信息。</p><p>如果您距离较远，则可以使用城镇或城市名称 (<b>$EXAMPLE_CODE$ Nairobi</b>)，或者输入包含区域代码的 plus+code (<b>$FULL_CODE$</b>)。</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>我需要申请 plus+code 吗？</h2><p>不需要。各个位置都有对应的 plus+code，所有人均可免费使用。</p><p>要获取某个位置的 plus+code，只需拖动地图以突显所需位置即可。</p>"
  }, 
  "help-03-0": {
    "message": "<h2>代码由哪些部分组成？</h2><p>以代码 <b>$FULL_CODE$</b> 为例，其中 <b>$CODE_PART_1$</b> 是区域代码（大约 100 平方公里）；<b>$CODE_PART_2$</b> 是城市代码（5 平方公里）；<b>$CODE_PART_3$</b> 是邻域代码（250 平方米）。<b>+</b> 后的 <b>$CODE_PART_4$</b> 是建筑物代码（14 平方米）。如果建筑物尺寸代码涵盖的范围超过一座建筑，则代码可以后跟一位数的门牌号代码。</p><p>一般情况下不需要区域代码，有些情况下也可以不提供城市代码。</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>一个位置有多个 plus+code 吗？</h2><p>不，每个位置只有一个 plus+code。</p>"
  }, 
  "help-03-2": {
    "message": "<h2>我可以保存 plus+code 吗？</h2><p>要保存 plus+code，您只需为页面创建一个书签即可。当您打开相应书签时，系统会为您显示对应的位置。</p>"
  }, 
  "help-03-3": {
    "message": "<h2>此功能可以在没有网络连接的情况下使用吗？</h2><p>可以。当您在手机或计算机上加载此页面之后，系统将会保存该页面的副本。即使您没有网络连接，也可以加载该页面。</p>"
  }, 
  "help-03-4": {
    "message": "<h2>我可以获得方向信息吗？</h2><p>罗盘模式可以向您展示方向以及您与当前的 plus+code 位置之间的距离。主菜单包含指向不同地图供应商的链接，供您选用。</p>"
  }, 
  "help-03-5": {
    "message": "<h2>我的 plus+code 区域过大！</h2><p>如果您进一步放大地图，代码对应的区域就会变小。</p>"
  }, 
  "help-03-6": {
    "message": "<h2>您显示的地址错误！</h2><p>我们提供的地址只是一个建议，它可以用来缩短您需要使用的代码长度。您可以尝试在搜索框中输入其他地址。</p>"
  }, 
  "input-prompt": {
    "message": "输入 plus+code、地址，或拖动地图"
  }, 
  "location-prompt": {
    "message": "此服务需要使用您的位置信息。如果浏览器提出相应请求，请允许。"
  }, 
  "map-error": {
    "message": "无法加载 Google 地图。请确保您的网络连接正常，然后尝试重新加载页面。<br/><br/>您可以输入 plus+code（有无区域代码均可），也可以使用罗盘，不过您只能在地图显示之后输入地址或附带地址的 plus+code。"
  }, 
  "osm-maps": {
    "message": "打开街道地图"
  }, 
  "ui-feedback": {
    "message": "反馈"
  }, 
  "ui-github": {
    "message": "查看项目"
  }, 
  "ui-help": {
    "message": "帮助"
  }, 
  "ui-language": {
    "message": "语言"
  }, 
  "ui-satellite": {
    "message": "卫星"
  }, 
  "units-km": {
    "message": "公里"
  }, 
  "units-meters": {
    "message": "米"
  }, 
  "waiting-for-compass-1": {
    "message": "正在等待"
  }, 
  "waiting-for-compass-2": {
    "message": "罗盘读取数据"
  }, 
  "waiting-location": {
    "message": "正在确定位置信息..."
  }
}
LocalisedMessages["zh-TW"] = {
  "apple-maps": {
    "message": "Apple 地圖"
  }, 
  "apps": {
    "message": "應用程式"
  }, 
  "bing-maps": {
    "message": "Bing 地圖"
  }, 
  "browser-problem-msg": {
    "message": "您的瀏覽器不支援我們需要的所有功能，如定位與指南針。<br/><br/>建議改用 Chrome、Firefox 或 Opera。"
  }, 
  "compass-check-fail-msg": {
    "message": "您裝置上的指南針並未回報方向，可能是裝置不支援指南針，或指南針無法正常運作。"
  }, 
  "compass-check-msg": {
    "message": "讀取指南針時可能發生問題。<br/><br/>若要測試，請將裝置平拿並旋轉一圈。<br/><br/>完整繞完一圈後，請輕按下方按鈕。"
  }, 
  "compass-check-ok": {
    "message": "您裝置上的指南針沒有問題！"
  }, 
  "dismiss": {
    "message": "關閉"
  }, 
  "extend-failure-msg": {
    "message": "若要知道$OLC$位於何處，我們需要您提供目前位置，或在資訊中加入鄉鎮或縣市名稱。<br/><br/>請確認瀏覽器允許定位，且裝置已啟用定位服務。", 
    "placeholders": {
      "OLC": {}
    }
  }, 
  "feedback-detail": {
    "message": "歡迎提供意見。無論是優點或有待改進之處，都請與我們分享，我們會努力改善。"
  }, 
  "geocode-fail": {
    "message": "Google 的地址服務找不到$ADDRESS$。", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-not-loaded": {
    "message": "Google 地址服務未載入，找不到$ADDRESS$。", 
    "placeholders": {
      "ADDRESS": {}
    }
  }, 
  "geocode-reverse-fail": {
    "message": "無法取得任何地址資訊 (Google 的地理編碼服務發生錯誤)"
  }, 
  "geocoder-no-info": {
    "message": "Google 的地理編碼服務沒有這個區域的地址資訊。若 40 公里內有較大的鄉鎮，建議使用 plus+code 加上該鄉鎮名稱。"
  }, 
  "google-maps": {
    "message": "Google 地圖"
  }, 
  "help-01-0": {
    "message": "<h2>您專屬的私人郵遞區號</h2><p>plus+code 是可代表任何位置或地點的短碼。您可以使用 plus+code 為他人提供快速可靠的指引，協助他們找到您的確切位置。</p>"
  }, 
  "help-02-0": {
    "message": "<h2>什麼是 plus+code？</h2><p>plus+code 是一種短碼，由 6 或 7 個字母與數字組成，如 <b>$EXAMPLE_CODE$</b>；有時也會加上鄉鎮或縣市名稱，如<b>$EXAMPLE_CODE$奈洛比</b>。</p><p>在不清楚街道名稱或建築物門牌號碼的情況下，您可以藉由 plus+code 為他人提供確切位置。</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }
    }
  }, 
  "help-02-1": {
    "message": "<h2>我要如何找出 plus+code？</h2><p>在手機或電腦上輸入 plus+code (<b>$EXAMPLE_CODE$</b>)，即可找出最接近的結果。只要您位於目標地點約 40 公里的範圍內，這個結果就能顯示正確位置。</p><p>若距離較遠，請使用鄉鎮或縣市名稱 (<b>$EXAMPLE_CODE$奈洛比</b>)，或輸入含區域碼的 plus+code (<b>$FULL_CODE$</b>)。</p>", 
    "placeholders": {
      "EXAMPLE_CODE": {
        "content": "MQRG+59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-02-2": {
    "message": "<h2>我需要申請 plus+code 嗎？</h2><p>不用，每個地方原本就有 plus+code，且任何人皆可免費使用。</p><p>若要取得某個地點的 plus+code，只要拖曳地圖，標示出想要的地點即可。</p>"
  }, 
  "help-03-0": {
    "message": "<h2>代碼由哪些部分組成？</h2><p>以我們的範例代碼 <b>$FULL_CODE$</b> 為例，<b>$CODE_PART_1$</b> 是區域碼 (約 100 x 100 公里)；<b>$CODE_PART_2$</b> 是縣市代碼 (5 x 5 公里)；<b>$CODE_PART_3$</b> 是鄰近地區代碼 (250 x 250 公尺)。位於 <b>+</b> 後面的 <b>$CODE_PART_4$</b> 是建築物代碼 (14 x 14 公尺)。若建築物的大小代碼橫跨多棟建築物，可在後面加上單一數字的大門代碼。</p><p>區域碼通常不會用到，有時連縣市代碼也能省略。</p>", 
    "placeholders": {
      "CODE_PART_1": {
        "content": "6GCR"
      }, 
      "CODE_PART_2": {
        "content": "MQ"
      }, 
      "CODE_PART_3": {
        "content": "RG"
      }, 
      "CODE_PART_4": {
        "content": "59"
      }, 
      "FULL_CODE": {
        "content": "6GCRMQRG+59"
      }
    }
  }, 
  "help-03-1": {
    "message": "<h2>一個位置會有多個 plus+code 嗎？</h2><p>不會，任何位置都只有一個 plus+code。</p>"
  }, 
  "help-03-2": {
    "message": "<h2>我可以儲存 plus+code 嗎？</h2><p>只要為頁面新增書籤，即可儲存 plus+code。日後打開書籤，就能看到地點。</p>"
  }, 
  "help-03-3": {
    "message": "<h2>沒有網路也可以使用嗎？</h2><p>可以！手機或電腦載入此頁面後，會保留一份副本，即使沒有網路連線也能載入。</p>"
  }, 
  "help-03-4": {
    "message": "<h2>我可以規劃路線嗎？</h2><p>指南針模式可以顯示您所在位置與目前 plus+code 之間的路線及距離，主選單也提供了多個地圖服務供應商的連結。</p>"
  }, 
  "help-03-5": {
    "message": "<h2>我的 plus+code 區域過大！</h2><p>若再放大畫面，代碼會顯示較小範圍的區域。</p>"
  }, 
  "help-03-6": {
    "message": "<h2>您顯示的地址有誤！</h2><p>這裡提供的地址僅供參考，主要目的是縮短您要使用的代碼長度。請在搜尋框裡輸入其他地址。</p>"
  }, 
  "input-prompt": {
    "message": "請輸入 plus+code、地址，或拖曳地圖"
  }, 
  "location-prompt": {
    "message": "此服務需要使用您的位置，瀏覽器詢問時請允許使用。"
  }, 
  "map-error": {
    "message": "無法載入 Google 地圖。請確認網路連線，再嘗試重新載入頁面。<br/><br/>您可以輸入包含或不含區域碼的 plus+code，也可以使用指南針，但須等到地圖顯示後，才能輸入地址或 plus+code 與地址。"
  }, 
  "osm-maps": {
    "message": "開啟街道地圖"
  }, 
  "ui-feedback": {
    "message": "意見回饋"
  }, 
  "ui-github": {
    "message": "查看專案"
  }, 
  "ui-help": {
    "message": "說明"
  }, 
  "ui-language": {
    "message": "語言"
  }, 
  "ui-satellite": {
    "message": "衛星檢視"
  }, 
  "units-km": {
    "message": "公里"
  }, 
  "units-meters": {
    "message": "公尺"
  }, 
  "waiting-for-compass-1": {
    "message": "正在等候"
  }, 
  "waiting-for-compass-2": {
    "message": "指南針讀數"
  }, 
  "waiting-location": {
    "message": "正在判斷裝置位置..."
  }
}
