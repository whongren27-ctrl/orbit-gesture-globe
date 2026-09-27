import * as THREE from 'three';

export function latLngToVector3(latitude, longitude, radius = 1, target = new THREE.Vector3()) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lng = THREE.MathUtils.degToRad(longitude);
  return target.set(
    radius * Math.cos(lat) * Math.sin(lng),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lng),
  );
}

export function displayCityName(name = '') {
  return name.toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
}
