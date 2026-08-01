import live1 from './live-1.mjs';
import live2 from './live-2.mjs';
import live3 from './live-3.mjs';
import live4 from './live-4.mjs';
import pilots from './pilots.mjs';
import quarantine1 from './quarantine-1.mjs';
import quarantine2 from './quarantine-2.mjs';

const byId=new Map([...live1,...live2,...live3,...live4].map(game=>[game.id,game]));
for(const pilot of pilots)byId.set(pilot.id,pilot);

export const catalogue=[...byId.values()];
export const pilotCatalogue=pilots.map(game=>({...game}));
export const quarantinedCatalogue=[...quarantine1,...quarantine2];
