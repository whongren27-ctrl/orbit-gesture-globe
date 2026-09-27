import OrbitalRings from '../globe/OrbitalRings.jsx';
import Moon from './Moon.jsx';
import Satellite from './Satellite.jsx';

export default function OrbitalCompanions({events,reducedMotion=false}){
  return <><OrbitalRings/><Moon reducedMotion={reducedMotion}/><Satellite events={events} reducedMotion={reducedMotion}/></>;
}
