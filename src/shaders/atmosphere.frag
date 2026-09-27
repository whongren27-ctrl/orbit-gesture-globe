uniform vec3 uColor;
uniform vec3 uLightDirection;
uniform float uPower;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vViewDirection;
void main(){
  vec3 normal=normalize(vNormal);
  vec3 viewDirection=normalize(vViewDirection);
  float facing=abs(dot(normal,viewDirection));
  float fresnel=pow(clamp(1.0-facing,0.0,1.0),uPower);
  float lightFactor=max(dot(normal,normalize(uLightDirection)),0.0);
  float directional=mix(0.55,1.0,smoothstep(0.0,0.8,lightFactor));
  gl_FragColor=vec4(uColor,fresnel*uOpacity*directional);
  #include <colorspace_fragment>
}
