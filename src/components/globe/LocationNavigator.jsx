import { MapPin } from 'lucide-react';
import { locations } from '../../data/locations';

export function getAdjacentLocation(activeLocation, direction) {
  const currentIndex = locations.findIndex(location => location.name === activeLocation?.name);
  if (currentIndex < 0) return direction > 0 ? locations[0] : locations[locations.length - 1];
  const baseIndex = currentIndex;
  const nextIndex = (baseIndex + direction + locations.length) % locations.length;
  return locations[nextIndex];
}

export default function LocationNavigator({ activeLocation, onFocusLocation }) {
  return <nav className="location-navigator" aria-label="City focus">
    <span className="location-navigator-label"><MapPin size={12} strokeWidth={1.5}/> CITY FOCUS</span>
    <div className="location-navigator-list">
      {locations.map(location => {
        const active = activeLocation?.name === location.name;
        return <button
          key={location.name}
          type="button"
          className={active ? 'location-chip active' : 'location-chip'}
          style={{ '--city-accent': location.accentColor }}
          aria-pressed={active}
          onClick={() => onFocusLocation(location)}
        >{location.name}</button>;
      })}
    </div>
  </nav>;
}
