varying vec3 vNormal;
varying vec3 vViewDirection;
void main(){
  vec4 viewPosition=modelViewMatrix*vec4(position,1.0);
  vNormal=normalize(normalMatrix*normal);
  vViewDirection=normalize(-viewPosition.xyz);
  gl_Position=projectionMatrix*viewPosition;
}
