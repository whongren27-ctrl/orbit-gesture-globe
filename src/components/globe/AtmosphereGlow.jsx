import {useMemo} from 'react';
import * as THREE from 'three';
import atmosphereVertexShader from '../../shaders/atmosphere.vert?raw';
import atmosphereFragmentShader from '../../shaders/atmosphere.frag?raw';

function AtmosphereLayer({radius,scale,color,power,opacity,side}){
  const uniforms=useMemo(()=>({
    uColor:{value:new THREE.Color(color)},
    uLightDirection:{value:new THREE.Vector3(-0.45,0.62,0.64).normalize()},
    uPower:{value:power},
    uOpacity:{value:opacity},
  }),[color,power,opacity]);

  return <mesh scale={scale}>
    <sphereGeometry args={[radius,96,96]}/>
    <shaderMaterial
      uniforms={uniforms}
      vertexShader={atmosphereVertexShader}
      fragmentShader={atmosphereFragmentShader}
      transparent
      depthTest
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      side={side}
      toneMapped={false}
    />
  </mesh>;
}

function RadialHalo(){
  const uniforms=useMemo(()=>({
    uCyan:{value:new THREE.Color('#42baca')},
    uBlue:{value:new THREE.Color('#244966')},
    uDiameter:{value:11.2},
    uIntensity:{value:0.035},
  }),[]);

  return <mesh position={[0,0,-2.52]} renderOrder={-1}>
    <circleGeometry args={[5.6,128]}/>
    <shaderMaterial
      uniforms={uniforms}
      transparent
      depthTest
      depthWrite={false}
      blending={THREE.AdditiveBlending}
      side={THREE.DoubleSide}
      toneMapped={false}
      vertexShader={`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
      fragmentShader={`
        uniform vec3 uCyan;
        uniform vec3 uBlue;
        uniform float uDiameter;
        uniform float uIntensity;
        varying vec2 vUv;

        void main(){
          float radius=length(vUv-vec2(0.5))*uDiameter;
          float centerFade=smoothstep(2.08,2.42,radius);
          float haze=exp(-pow((radius-3.02)/1.28,2.0));
          float outerFade=1.0-smoothstep(4.35,5.6,radius);
          float alpha=centerFade*haze*outerFade*uIntensity;
          vec3 color=mix(uCyan,uBlue,smoothstep(2.65,5.0,radius));
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }
      `}
    />
  </mesh>;
}

export default function AtmosphereGlow({radius=2}){
  return <group>
    <RadialHalo/>
    <AtmosphereLayer radius={radius} scale={1.014} color="#65f5ff" power={4.5} opacity={0.58} side={THREE.BackSide}/>
    <AtmosphereLayer radius={radius} scale={1.05} color="#50b9cc" power={2.8} opacity={0.14} side={THREE.FrontSide}/>
  </group>;
}
