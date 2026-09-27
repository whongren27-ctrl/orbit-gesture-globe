uniform vec3 uBaseColor;
uniform vec3 uLightDirection;
varying vec3 vNormal;
varying vec3 vViewDirection;
void main(){
  vec3 normal=normalize(vNormal);
  float facing=max(dot(normal,normalize(vViewDirection)),0.0);
  float diffuse=max(dot(normal,normalize(uLightDirection)),0.0);
  float centerIllumination=0.58+0.42*pow(facing,1.4);
  vec3 color=uBaseColor*centerIllumination+vec3(0.004,0.018,0.024)*diffuse;
  gl_FragColor=vec4(color,1.0);
  #include <colorspace_fragment>
}
