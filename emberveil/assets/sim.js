/**
 * Emberveil RTS - deterministic simulation core (no DOM/canvas).
 * Used by rts.html and by Node tests. Built from simsrc/*.js by build.js.
 */
'use strict';

const TICK_RATE = 20; // Hz
const DT = 1 / TICK_RATE;
const CELL = 20; // path/LOS grid cell size (sim units)
const FOG_CELL = 40;
const HERO_RESPAWN = 50;

const FACTIONS = {
  vigilant: { id: 'vigilant', name: 'Vigilant Order', color: '#4a9eff', accent: '#8ec8ff', style: 'ranged' },
  riven: { id: 'riven', name: 'Riven Horde', color: '#e85d3a', accent: '#ff9a6b', style: 'melee' },
};

/* Armour classes: inf, heavy, vehicle, building, commander. Weapon classes multiply against them. */
const DAMAGE_TABLE = {
  small:      { inf: 1.0,  heavy: 0.45, vehicle: 0.06, building: 0.12, commander: 0.55 },
  heavy:      { inf: 0.9,  heavy: 1.25, vehicle: 0.35, building: 0.4,  commander: 0.9 },
  flame:      { inf: 1.35, heavy: 0.6,  vehicle: 0.08, building: 0.45, commander: 0.6 },
  lance:      { inf: 0.35, heavy: 0.75, vehicle: 1.9,  building: 1.3,  commander: 0.85 },
  sniper:     { inf: 2.2,  heavy: 0.5,  vehicle: 0.02, building: 0.05, commander: 0.7 },
  melee:      { inf: 1.0,  heavy: 0.6,  vehicle: 0.12, building: 0.35, commander: 0.7 },
  powerMelee: { inf: 0.9,  heavy: 1.15, vehicle: 1.3,  building: 1.0,  commander: 1.0 },
  explosive:  { inf: 1.25, heavy: 0.85, vehicle: 0.5,  building: 0.8,  commander: 0.6 },
  suppress:   { inf: 0.75, heavy: 0.3,  vehicle: 0.04, building: 0.08, commander: 0.4 },
  cannon:     { inf: 0.8,  heavy: 1.05, vehicle: 1.25, building: 1.4,  commander: 0.8 },
  turret:     { inf: 1.0,  heavy: 0.7,  vehicle: 0.3,  building: 0.2,  commander: 0.7 },
};

/* Weapons: per model. fx = renderer visual (tracer, beam, flame, snipe, shell, slash). */
const WEAPONS = {
  fists:        { name: 'Close combat', type: 'melee', damage: 5, cooldown: 1.0, range: 30, melee: true, fx: 'slash' },
  v_bayonet:    { name: 'Lumen bayonet', type: 'melee', damage: 8, cooldown: 0.85, range: 30, melee: true, fx: 'slash' },
  v_pistol:     { name: 'Rivet pistol', type: 'small', damage: 4, cooldown: 0.9, range: 130, fx: 'tracer' },
  v_rifle:      { name: 'Lumen rifle', type: 'small', damage: 8, cooldown: 0.8, range: 200, fx: 'tracer' },
  v_pyre:       { name: 'Pyre projector', type: 'flame', damage: 8, cooldown: 0.5, range: 115, splash: 26, morale: 1.6, ignoresCover: true, fx: 'flame' },
  v_lance:      { name: 'Sun-lance', type: 'lance', damage: 55, cooldown: 3.2, range: 220, fx: 'beam' },
  v_thresher:   { name: 'Thresher autogun', type: 'suppress', damage: 6, cooldown: 0.22, range: 240, suppress: 7, setup: 2.2, morale: 1.4, fx: 'tracer' },
  v_longlas:    { name: 'Veil long-rifle', type: 'sniper', damage: 70, cooldown: 4.5, range: 340, fx: 'snipe', reveal: true },
  v_bolter:     { name: 'Bolt-caster', type: 'heavy', damage: 11, cooldown: 0.7, range: 210, fx: 'tracer' },
  v_storm:      { name: 'Storm cannon', type: 'heavy', damage: 9, cooldown: 0.3, range: 220, suppress: 3, fx: 'tracer' },
  v_blade:      { name: 'Seraph blade', type: 'melee', damage: 14, cooldown: 0.7, range: 32, melee: true, fx: 'slash' },
  v_hammer:     { name: 'Thunder maul', type: 'powerMelee', damage: 30, cooldown: 1.2, range: 34, melee: true, fx: 'slash' },
  v_autogun:    { name: 'Carrier autogun', type: 'small', damage: 10, cooldown: 0.4, range: 210, fx: 'tracer' },
  v_walkercannon:{ name: 'Twin battle-cannon', type: 'cannon', damage: 48, cooldown: 1.7, range: 270, splash: 40, fx: 'shell' },
  v_sunlance:   { name: 'Dawnspear array', type: 'lance', damage: 95, cooldown: 1.5, range: 310, splash: 50, fx: 'beam' },
  v_kaelpistol: { name: 'Judgement pistol', type: 'heavy', damage: 24, cooldown: 0.8, range: 190, fx: 'tracer' },
  v_kaelsword:  { name: 'Oathblade', type: 'powerMelee', damage: 40, cooldown: 0.8, range: 34, melee: true, fx: 'slash' },
  r_slugga:     { name: 'Scrap pistol', type: 'small', damage: 4, cooldown: 0.9, range: 120, fx: 'tracer' },
  r_cleaver:    { name: 'Bone cleaver', type: 'melee', damage: 8, cooldown: 0.6, range: 32, melee: true, fx: 'slash' },
  r_cinder:     { name: 'Cinder spitter', type: 'flame', damage: 8, cooldown: 0.5, range: 110, splash: 26, morale: 1.6, ignoresCover: true, fx: 'flame' },
  r_spike:      { name: 'Spike launcher', type: 'lance', damage: 50, cooldown: 3.0, range: 200, fx: 'shell' },
  r_rattler:    { name: 'Rattler gun', type: 'suppress', damage: 6, cooldown: 0.22, range: 230, suppress: 7, setup: 1.8, morale: 1.4, fx: 'tracer' },
  r_harpoon:    { name: 'Harpoon rifle', type: 'sniper', damage: 70, cooldown: 4.5, range: 330, fx: 'snipe', reveal: true },
  r_hammer:     { name: 'Slag hammer', type: 'melee', damage: 17, cooldown: 0.6, range: 36, melee: true, fx: 'slash' },
  r_claw:       { name: 'Ripper claw', type: 'powerMelee', damage: 30, cooldown: 1.0, range: 36, melee: true, fx: 'slash' },
  r_bigshoota:  { name: 'Hauler cannon', type: 'small', damage: 9, cooldown: 0.35, range: 200, fx: 'tracer' },
  r_maw:        { name: 'Crusher maw', type: 'powerMelee', damage: 62, cooldown: 1.0, range: 50, melee: true, fx: 'slash' },
  r_titanmaw:   { name: 'Furnace belcher', type: 'cannon', damage: 100, cooldown: 1.6, range: 250, splash: 60, fx: 'shell' },
  r_grashaxe:   { name: 'Gutsplitter axe', type: 'powerMelee', damage: 46, cooldown: 0.75, range: 40, melee: true, fx: 'slash' },
  r_grashgun:   { name: 'Kick-cannon', type: 'heavy', damage: 18, cooldown: 1.0, range: 150, fx: 'tracer' },
  t_turret:     { name: 'Bastion gun', type: 'turret', damage: 14, cooldown: 0.75, range: 220, fx: 'tracer' },
  t_hq:         { name: 'Nexus battery', type: 'turret', damage: 18, cooldown: 0.65, range: 250, fx: 'tracer' },
};

const U = (o) => Object.assign({
  models: 1, hp: 50, armor: 'inf', weapon: 'fists', meleeWeapon: 'fists', speed: 55, sight: 280, moraleMax: 100,
  captureRate: 1, costAether: 100, costFlux: 0, buildTime: 10, reinforceCost: 20, reinforceTime: 3, pop: 2, vpop: 0,
  role: 'ranged', canCapture: true, isBuilder: false, isWorker: false, isHero: false, isVehicle: false, isSuper: false,
  infiltrate: false, detector: false, jump: false, capacity: 0, abilities: [], wargear: [], wargearSlots: 2, producer: 'barracks',
}, o);

const UNIT_DEFS_RAW = {
  /* ---------------- Vigilant Order ---------------- */
  vig_builder: U({ faction: 'vigilant', name: 'Forge Adepts', tier: 1, models: 3, hp: 45, weapon: 'v_pistol', speed: 52, moraleMax: 80, captureRate: 0.6,
    costAether: 75, buildTime: 7, reinforceCost: 20, pop: 1, role: 'builder', isBuilder: true, producer: 'hq',
    desc: 'Builds and repairs structures and vehicles.', good: 'Construction, repair', bad: 'Any fighting' }),
  vig_worker: U({ faction: 'vigilant', name: 'Lumen Gleaner', tier: 1, models: 1, hp: 70, weapon: 'v_pistol', speed: 62, moraleMax: 60, canCapture: false,
    costAether: 50, buildTime: 6, reinforceCost: 0, pop: 1, role: 'worker', isWorker: true, producer: 'hq', wargearSlots: 0,
    desc: 'Harvests Aether crystals and salvages wrecks for Flux, hauling it to a Nexus or Siphon.', good: 'Economy', bad: 'Any fighting' }),
  vig_scout: U({ faction: 'vigilant', name: 'Aegis Cohort', tier: 1, models: 5, hp: 60, weapon: 'v_rifle', meleeWeapon: 'v_bayonet', speed: 56,
    costAether: 120, buildTime: 9, reinforceCost: 22, pop: 2, role: 'ranged', abilities: ['frag'],
    wargear: [{ id: 'v_pyre', max: 2, aether: 40, flux: 15, tier: 1 }, { id: 'v_lance', max: 1, aether: 50, flux: 35, tier: 2 }],
    desc: 'Disciplined line infantry. Upgrade with Pyre projectors or a Sun-lance.', good: 'Infantry, holding cover', bad: 'Vehicles, melee' }),
  vig_mg: U({ faction: 'vigilant', name: 'Thresher Team', tier: 1, models: 3, hp: 50, weapon: 'v_pistol', teamWeapon: 'v_thresher', speed: 48,
    costAether: 150, buildTime: 11, reinforceCost: 25, pop: 2, role: 'support', wargearSlots: 0,
    desc: 'Weapon team. Must set up, then suppresses and pins infantry.', good: 'Pinning infantry', bad: 'Flanks, vehicles, snipers' }),
  vig_sniper: U({ faction: 'vigilant', name: 'Veil Wardens', tier: 1, models: 2, hp: 40, weapon: 'v_longlas', speed: 52, sight: 360, moraleMax: 90,
    costAether: 140, costFlux: 25, buildTime: 11, reinforceCost: 35, pop: 2, role: 'sniper', infiltrate: true, detector: true, wargearSlots: 0,
    desc: 'Infiltrated marksmen. Invisible until detected or firing; detect hidden foes.', good: 'Infantry, weapon teams', bad: 'Vehicles, heavy infantry, melee' }),
  vig_heavy: U({ faction: 'vigilant', name: 'Bulwark Phalanx', tier: 2, models: 4, hp: 95, armor: 'heavy', weapon: 'v_bolter', meleeWeapon: 'v_bayonet', speed: 46, moraleMax: 130,
    captureRate: 0.9, costAether: 220, costFlux: 40, buildTime: 15, reinforceCost: 45, reinforceTime: 4, pop: 3, producer: 'armory', abilities: ['brace'],
    wargear: [{ id: 'v_storm', max: 2, aether: 60, flux: 30, tier: 2 }, { id: 'v_lance', max: 2, aether: 60, flux: 40, tier: 2 }],
    desc: 'Heavy armoured infantry with bolt-casters.', good: 'Heavy infantry, holding ground', bad: 'Snipers are weak vs them; vehicles without lances' }),
  vig_jump: U({ faction: 'vigilant', name: 'Seraph Vanguard', tier: 2, models: 4, hp: 75, armor: 'heavy', weapon: 'v_blade', meleeWeapon: 'v_blade', speed: 62, moraleMax: 120,
    costAether: 200, costFlux: 50, buildTime: 14, reinforceCost: 40, pop: 3, role: 'melee', jump: true, producer: 'armory', abilities: ['leap'],
    wargear: [{ id: 'v_hammer', max: 2, aether: 50, flux: 35, tier: 2 }],
    desc: 'Jump-pack assault troops. Leap over terrain onto enemy lines.', good: 'Weapon teams, snipers, ranged infantry', bad: 'Heavy infantry, massed melee' }),
  vig_transport: U({ faction: 'vigilant', name: 'Pilgrim Carrier', tier: 2, models: 1, hp: 560, armor: 'vehicle', weapon: 'v_autogun', speed: 82, sight: 300, moraleMax: 200,
    captureRate: 0, canCapture: false, costAether: 180, costFlux: 40, buildTime: 16, reinforceCost: 0, pop: 0, vpop: 1, role: 'vehicle', isVehicle: true,
    capacity: 2, producer: 'vehicleBay', wargearSlots: 0, desc: 'Armoured carrier. Holds 2 squads.', good: 'Moving squads safely', bad: 'Lances, power melee' }),
  vig_tank: U({ faction: 'vigilant', name: 'Aegis Walker', tier: 3, models: 1, hp: 950, armor: 'vehicle', weapon: 'v_walkercannon', meleeWeapon: 'v_hammer', speed: 40, sight: 300,
    moraleMax: 200, captureRate: 0, canCapture: false, costAether: 400, costFlux: 120, buildTime: 28, reinforceCost: 0, pop: 0, vpop: 2, role: 'vehicle', isVehicle: true,
    producer: 'vehicleBay', wargearSlots: 0, desc: 'Walking battle platform with twin cannons.', good: 'Everything at range', bad: 'Lances, power melee swarms' }),
  vig_super: U({ faction: 'vigilant', name: 'Sunforged Paragon', tier: 3, models: 1, hp: 3000, armor: 'vehicle', weapon: 'v_sunlance', meleeWeapon: 'v_hammer', speed: 34, sight: 340,
    moraleMax: 400, captureRate: 0, canCapture: false, costAether: 750, costFlux: 300, buildTime: 50, reinforceCost: 0, pop: 0, vpop: 3, role: 'vehicle', isVehicle: true, isSuper: true,
    producer: 'vehicleBay', wargearSlots: 0, desc: 'Colossal relic engine. Needs the Starheart Shard.', good: 'Everything', bad: 'Being surrounded' }),
  vig_commander: U({ faction: 'vigilant', name: 'Marshal Kael', tier: 1, models: 1, hp: 620, armor: 'commander', weapon: 'v_kaelpistol', meleeWeapon: 'v_kaelsword', speed: 60, sight: 320,
    moraleMax: 250, captureRate: 1.2, costAether: 0, buildTime: 0, reinforceCost: 0, pop: 0, role: 'hero', isHero: true, detector: true, producer: 'hq',
    abilities: ['ordnance', 'rally'], wargearSlots: 0, desc: 'Commander. Calls lance strikes and rallies troops.', good: 'Inspiring, dueling', bad: 'Being focused by lances' }),

  /* ---------------- Riven Horde ---------------- */
  riv_builder: U({ faction: 'riven', name: 'Scrap Crew', tier: 1, models: 3, hp: 40, weapon: 'r_slugga', speed: 56, moraleMax: 70, captureRate: 0.8,
    costAether: 65, buildTime: 6, reinforceCost: 18, pop: 1, role: 'builder', isBuilder: true, producer: 'hq',
    desc: 'Builds and bodges structures and vehicles back together.', good: 'Construction, repair', bad: 'Any fighting' }),
  riv_worker: U({ faction: 'riven', name: 'Ash Grubber', tier: 1, models: 1, hp: 62, weapon: 'r_slugga', speed: 66, moraleMax: 55, canCapture: false,
    costAether: 45, buildTime: 5, reinforceCost: 0, pop: 1, role: 'worker', isWorker: true, producer: 'hq', wargearSlots: 0,
    desc: 'Scrapes Aether crystals and strips wrecks for Flux, dragging it back to a Nexus or Scrap Pit.', good: 'Economy', bad: 'Any fighting' }),
  riv_pack: U({ faction: 'riven', name: 'Bone Pack', tier: 1, models: 7, hp: 37, weapon: 'r_cleaver', meleeWeapon: 'r_cleaver', speed: 64, moraleMax: 80, captureRate: 1.15,
    costAether: 100, buildTime: 7, reinforceCost: 15, reinforceTime: 2.2, pop: 2, role: 'melee', abilities: ['firebomb'],
    wargear: [{ id: 'r_cinder', max: 2, aether: 35, flux: 15, tier: 1 }, { id: 'r_spike', max: 1, aether: 45, flux: 35, tier: 2 }],
    desc: 'Savage melee horde. Add Cinder spitters or a Spike launcher.', good: 'Ranged infantry, weapon teams', bad: 'Heavy infantry, flamers' }),
  riv_mg: U({ faction: 'riven', name: 'Rattler Crew', tier: 1, models: 3, hp: 45, weapon: 'r_slugga', teamWeapon: 'r_rattler', speed: 52,
    costAether: 140, buildTime: 10, reinforceCost: 22, pop: 2, role: 'support', wargearSlots: 0,
    desc: 'Weapon team. Sets up a rattler gun that pins infantry.', good: 'Pinning infantry', bad: 'Flanks, vehicles, snipers' }),
  riv_sniper: U({ faction: 'riven', name: 'Ash Stalkers', tier: 1, models: 2, hp: 38, weapon: 'r_harpoon', speed: 56, sight: 350, moraleMax: 80,
    costAether: 130, costFlux: 25, buildTime: 10, reinforceCost: 32, pop: 2, role: 'sniper', infiltrate: true, detector: true, wargearSlots: 0,
    desc: 'Hidden harpooners. Invisible until detected or firing; detect hidden foes.', good: 'Infantry, weapon teams', bad: 'Vehicles, heavy infantry, melee' }),
  riv_brute: U({ faction: 'riven', name: 'Iron Brutes', tier: 2, models: 5, hp: 85, armor: 'heavy', weapon: 'r_hammer', meleeWeapon: 'r_hammer', speed: 58, moraleMax: 110,
    captureRate: 1.1, costAether: 190, costFlux: 30, buildTime: 13, reinforceCost: 32, reinforceTime: 3.5, pop: 3, role: 'melee', producer: 'armory', abilities: ['charge'],
    wargear: [{ id: 'r_claw', max: 2, aether: 50, flux: 30, tier: 2 }],
    desc: 'Heavy melee bruisers. Ripper claws tear open vehicles.', good: 'Infantry, heavy infantry', bad: 'Massed flamers, pinning at range' }),
  riv_jump: U({ faction: 'riven', name: 'Cinder Leapers', tier: 2, models: 5, hp: 55, weapon: 'r_cleaver', meleeWeapon: 'r_cleaver', speed: 66, moraleMax: 90,
    costAether: 170, costFlux: 40, buildTime: 12, reinforceCost: 26, pop: 3, role: 'melee', jump: true, producer: 'armory', abilities: ['leap'],
    wargear: [{ id: 'r_claw', max: 1, aether: 45, flux: 30, tier: 2 }],
    desc: 'Rocket-strapped maniacs. Leap across chasms onto the enemy.', good: 'Weapon teams, snipers, ranged infantry', bad: 'Heavy infantry' }),
  riv_transport: U({ faction: 'riven', name: 'Scrap Hauler', tier: 2, models: 1, hp: 500, armor: 'vehicle', weapon: 'r_bigshoota', speed: 88, sight: 290, moraleMax: 200,
    captureRate: 0, canCapture: false, costAether: 160, costFlux: 40, buildTime: 14, reinforceCost: 0, pop: 0, vpop: 1, role: 'vehicle', isVehicle: true,
    capacity: 2, producer: 'vehicleBay', wargearSlots: 0, desc: 'Rattling hauler. Holds 2 squads.', good: 'Delivering a charge', bad: 'Lances, power melee' }),
  riv_beast: U({ faction: 'riven', name: 'Riven Behemoth', tier: 3, models: 1, hp: 1050, armor: 'vehicle', weapon: 'r_maw', meleeWeapon: 'r_maw', speed: 48, sight: 290,
    moraleMax: 200, captureRate: 0, canCapture: false, costAether: 380, costFlux: 100, buildTime: 26, reinforceCost: 0, pop: 0, vpop: 2, role: 'vehicle', isVehicle: true,
    producer: 'vehicleBay', wargearSlots: 0, desc: 'Four-legged crusher. Tears through lines in melee.', good: 'Infantry, buildings', bad: 'Lances, kiting' }),
  riv_super: U({ faction: 'riven', name: 'Ashmaw Titan', tier: 3, models: 1, hp: 3300, armor: 'vehicle', weapon: 'r_titanmaw', meleeWeapon: 'r_maw', speed: 36, sight: 320,
    moraleMax: 400, captureRate: 0, canCapture: false, costAether: 720, costFlux: 300, buildTime: 50, reinforceCost: 0, pop: 0, vpop: 3, role: 'vehicle', isVehicle: true, isSuper: true,
    producer: 'vehicleBay', wargearSlots: 0, desc: 'Walking furnace-idol. Needs the Starheart Shard.', good: 'Everything', bad: 'Being surrounded' }),
  riv_warlord: U({ faction: 'riven', name: 'Warlord Grash', tier: 1, models: 1, hp: 720, armor: 'commander', weapon: 'r_grashgun', meleeWeapon: 'r_grashaxe', speed: 64, sight: 300,
    moraleMax: 250, captureRate: 1.5, costAether: 0, buildTime: 0, reinforceCost: 0, pop: 0, role: 'hero', isHero: true, detector: true, producer: 'hq', meleeFirst: true,
    abilities: ['rampage', 'howl'], wargearSlots: 0, desc: 'Commander. Frenzies in melee and howls enemies into terror.', good: 'Melee, breaking squads', bad: 'Kiting, lances' }),
};
const UNIT_DEFS = UNIT_DEFS_RAW;
for (const d of Object.values(UNIT_DEFS)) d.civil = d.isBuilder || d.isWorker;
// legacy numeric fields some UI bits read
for (const k of Object.keys(UNIT_DEFS)) {
  const d = UNIT_DEFS[k], w = WEAPONS[d.teamWeapon || d.weapon];
  d.id = k; d.attackRange = w.range; d.meleeRange = 32; d.damage = w.damage;
}

const HERO_GEAR = {
  vigilant: {
    weapon: { name: 'Dawnbreaker Blade', tier: 2, aether: 120, flux: 60, desc: '+50% damage, cleaving power-strikes' },
    ultimate: { name: 'Aegis of First Light', tier: 3, aether: 220, flux: 120, desc: '+60% health, regenerates, +25% damage' },
  },
  riven: {
    weapon: { name: 'Ripsaw Cleaver', tier: 2, aether: 110, flux: 60, desc: '+50% damage, cleaving power-strikes' },
    ultimate: { name: 'Pyre Crown of the Warlord', tier: 3, aether: 220, flux: 120, desc: '+60% health, regenerates, +25% damage' },
  },
};

const ABILITIES = {
  ordnance: { name: 'Lance Strike', cd: 40, target: 'point', range: 380, radius: 75, damage: 130, delay: 1.4, desc: 'Orbital lance strike after a short delay.' },
  rally: { name: 'Litany of Iron', cd: 45, target: 'self', radius: 260, desc: 'Nearby squads regain morale, rally and shrug off suppression.' },
  rampage: { name: 'Blood-Frenzy', cd: 35, target: 'self', duration: 8, desc: '+50% damage and +25% speed for 8s.' },
  howl: { name: 'Dread Howl', cd: 40, target: 'self', radius: 240, desc: 'Enemies nearby lose morale and are suppressed.' },
  frag: { name: 'Flare Grenade', cd: 30, target: 'point', range: 210, radius: 55, damage: 48, delay: 1.0, research: 'r_grenades', desc: 'Explosive grenade. Great vs clustered infantry and weapon teams.' },
  firebomb: { name: 'Firebomb', cd: 30, target: 'point', range: 190, radius: 60, damage: 40, delay: 1.0, flame: true, research: 'r_grenades', desc: 'Flaming bomb that ignores cover and scares squads.' },
  brace: { name: 'Brace Shields', cd: 30, target: 'self', duration: 8, desc: 'Cannot move; -40% damage taken; immune to suppression.' },
  leap: { name: 'Leap', cd: 18, target: 'point', range: 400, radius: 45, damage: 22, duration: 1.0, desc: 'Jump to a point over obstacles; landing knocks foes back.' },
  charge: { name: 'Iron Charge', cd: 25, target: 'self', duration: 4, desc: '+80% speed, immune to suppression, first strikes hit double.' },
};

const BUILDING_DEFS = {
  hq: { name: 'Command Nexus', hp: 3200, armor: 'building', costAether: 0, costFlux: 0, buildTime: 0, size: 70, sight: 380, detector: true,
    produces: true, generatesFlux: 0, isHQ: true, turretWeapon: 't_hq', desc: 'Your base. Trains builders, researches tiers. Lose it and you lose.' },
  barracks: { name: 'Muster Hall', hp: 900, armor: 'building', costAether: 150, costFlux: 0, buildTime: 20, size: 50, sight: 280,
    produces: true, generatesFlux: 0, desc: 'Trains infantry. Retreat and reinforce point.' },
  generator: { name: 'Flux Dynamo', hp: 450, armor: 'building', costAether: 100, costFlux: 0, buildTime: 16, size: 36, sight: 220,
    produces: false, generatesFlux: 2, desc: 'Generates +2 Flux per second.' },
  armory: { name: 'War Forge', hp: 800, armor: 'building', costAether: 200, costFlux: 50, buildTime: 24, size: 48, sight: 260, requiresTier: 2,
    produces: true, generatesFlux: 0, desc: 'Trains elite infantry. Researches armour.' },
  vehicleBay: { name: 'Siege Cradle', hp: 1000, armor: 'building', costAether: 250, costFlux: 90, buildTime: 30, size: 56, sight: 260, requiresTier: 2,
    produces: true, generatesFlux: 0, desc: 'Builds vehicles. Super unit if you hold the Starheart Shard.' },
  bastion: { name: 'Relay Bastion', hp: 600, armor: 'building', costAether: 100, costFlux: 25, buildTime: 14, size: 32, sight: 300, detector: true,
    produces: false, generatesFlux: 0, fortifies: true, turretWeapon: 't_turret', desc: 'Fortifies an owned Relay: +35% Aether, turret, detection, reinforce point.' },
  refinery: { name: 'Aether Siphon', hp: 650, armor: 'building', costAether: 120, costFlux: 0, buildTime: 14, size: 38, sight: 260,
    produces: false, generatesFlux: 0, dropOff: true, desc: 'Drop-off point for harvested Aether and salvage. Build it next to a crystal field.' },
  bunker: { name: 'Ruined Redoubt', hp: 1400, armor: 'building', costAether: 0, costFlux: 0, buildTime: 0, size: 34, sight: 300, neutral: true,
    produces: false, generatesFlux: 0, desc: 'Neutral strongpoint. One squad can garrison it for cover and range.' },
};

const TECH = {
  1: { name: 'Muster', costAether: 0, costFlux: 0, time: 0 },
  2: { name: 'War Forge', costAether: 250, costFlux: 80, time: 25 },
  3: { name: 'Siege', costAether: 400, costFlux: 150, time: 35 },
};

const RESEARCH = {
  r_grenades: { name: { vigilant: 'Ember Munitions', riven: 'Firebomb Stash' }, building: 'barracks', tier: 1, aether: 100, flux: 40, time: 22, desc: 'Unlocks Flare Grenade / Firebomb abilities.' },
  r_cap: { name: { vigilant: 'Expanded Muster', riven: 'Bigger Mob' }, building: 'hq', tier: 1, aether: 150, flux: 50, time: 28, desc: '+8 squad cap.' },
  r_morale: { name: { vigilant: 'Litany of Resolve', riven: 'Blood Oaths' }, building: 'barracks', tier: 2, aether: 150, flux: 60, time: 28, desc: '+30% infantry morale.' },
  r_hp: { name: { vigilant: 'Tempered Plate', riven: 'Thicker Hides' }, building: 'armory', tier: 2, aether: 200, flux: 80, time: 32, desc: '+20% infantry health.' },
  r_sight: { name: { vigilant: 'Augur Lenses', riven: 'Ash-Sight Totems' }, building: 'hq', tier: 2, aether: 120, flux: 60, time: 24, desc: '+25% sight; all your squads detect hidden units nearby.' },
  r_vcap: { name: { vigilant: 'Siege Logistics', riven: 'More Scrap' }, building: 'vehicleBay', tier: 2, aether: 180, flux: 100, time: 30, desc: '+3 vehicle cap.' },
};

const BASE_SQUAD_CAP = 20, BASE_VEHICLE_CAP = 4;
// Gathering: workers carry a load from a crystal node / wreck to the nearest drop-off.
const GATHER = { carryAether: 8, carryFlux: 6, mineTime: 3.2, salvageTime: 3.5, nodeAmount: 500, workerCap: 12,
  upkeepFree: 12, upkeepPerPop: 0.03, upkeepMin: 0.5, hqAether: 2 };
const UPGRADE_COST = { aether: 60, flux: 30 };

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
let nextId = 1;
function nid(prefix) { return prefix + (nextId++); }
/* ------------------------------ Maps ------------------------------ */
function chain(list, kind, pts, r, step) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.round(dist(ax, ay, bx, by) / (step || r * 0.9)));
    for (let k = 0; k <= n; k++) list.push({ kind, x: ax + (bx - ax) * k / n, y: ay + (by - ay) * k / n, r });
  }
}
const MAPS = {
  basin: {
    id: 'basin', name: 'Cinder Basin', w: 2400, h: 1800,
    blurb: 'Two ridges split the basin into three lanes around the Starheart Shard.',
    hq: { vigilant: [280, 900], riven: [2120, 900] },
    relays: [
      ['r0', 430, 900, false], ['r1', 1200, 360, true], ['r3', 1200, 1440, true], ['r4', 1970, 900, false],
      ['r5', 700, 1420, false], ['r6', 1700, 380, false],
    ],
    relic: [1200, 900],
    bunkers: [[900, 330], [1500, 1470], [1010, 1160], [1390, 640]],
    // crystal fields: [x, y, rich]; wrecks: [x, y, flux]
    fields: [[330, 680, 0], [2070, 1120, 0], [470, 1390, 0], [1930, 410, 0], [1200, 600, 1], [1200, 1200, 1]],
    wrecks: [[1040, 860, 120], [1360, 940, 120], [820, 420, 80], [1580, 1380, 80]],
    build(o) {
      chain(o, 'cliff', [[620, 560], [820, 620], [960, 700]], 42);
      chain(o, 'cliff', [[1780, 1240], [1580, 1180], [1440, 1100]], 42);
      chain(o, 'cliff', [[1460, 690], [1600, 610], [1760, 560]], 40);
      chain(o, 'cliff', [[940, 1110], [800, 1190], [640, 1240]], 40);
      chain(o, 'cliff', [[1200, 120], [1200, 230]], 36);
      chain(o, 'cliff', [[1200, 1680], [1200, 1570]], 36);
    },
  },
  causeway: {
    id: 'causeway', name: 'Shattered Causeway', w: 2600, h: 1600,
    blurb: 'A lava chasm splits the field. Three bridges, or jump troops, cross it.',
    hq: { vigilant: [270, 800], riven: [2330, 800] },
    relays: [
      ['r0', 560, 330, false], ['r1', 560, 1270, false], ['r2', 1000, 800, true],
      ['r3', 1600, 800, true], ['r4', 2040, 1270, false], ['r5', 2040, 330, false],
    ],
    relic: [1300, 800],
    bunkers: [[1110, 300], [1490, 1300], [1100, 1150], [1500, 450]],
    fields: [[320, 585, 0], [2280, 585, 0], [430, 1190, 0], [2170, 1190, 0], [990, 520, 1], [1610, 1080, 1]],
    wrecks: [[1160, 980, 120], [1440, 620, 120], [700, 800, 70], [1900, 800, 70]],
    build(o) {
      // chasm with three bridges (y ~ 260, 800, 1340)
      chain(o, 'chasm', [[1300, 0], [1300, 175]], 48, 34);
      chain(o, 'chasm', [[1300, 345], [1300, 700]], 48, 34);
      chain(o, 'chasm', [[1300, 900], [1300, 1255]], 48, 34);
      chain(o, 'chasm', [[1300, 1425], [1300, 1600]], 48, 34);
      chain(o, 'cliff', [[760, 560], [880, 620]], 40);
      chain(o, 'cliff', [[1840, 1040], [1720, 980]], 40);
      chain(o, 'cliff', [[760, 1040], [880, 980]], 40);
      chain(o, 'cliff', [[1840, 560], [1720, 620]], 40);
    },
  },
};

function createMap(seed, mapId) {
  const md = MAPS[mapId] || MAPS.basin;
  const rng = mulberry32(seed);
  const w = md.w, h = md.h;
  const obstacles = [];
  md.build(obstacles);
  const relays = md.relays.map(([id, x, y, critical]) => ({ id, x, y, critical }));
  relays.push({ id: 'relic', x: md.relic[0], y: md.relic[1], critical: true, relic: true });
  const hqSpawns = { vigilant: { x: md.hq.vigilant[0], y: md.hq.vigilant[1] }, riven: { x: md.hq.riven[0], y: md.hq.riven[1] } };
  const nearObs = (x, y, pad) => obstacles.some((o) => dist(x, y, o.x, o.y) < o.r + pad);
  const keepClear = (x, y, pad) => relays.some((r) => dist(x, y, r.x, r.y) < 85 + pad) || dist(x, y, hqSpawns.vigilant.x, hqSpawns.vigilant.y) < 300 + pad
    || dist(x, y, hqSpawns.riven.x, hqSpawns.riven.y) < 300 + pad || md.bunkers.some((b) => dist(x, y, b[0], b[1]) < 60 + pad)
    || (md.fields || []).some((f) => dist(x, y, f[0], f[1]) < 90 + pad);
  // mirrored cover so both sides are fair (point symmetry about map centre)
  const cover = [];
  for (let i = 0, tries = 0; cover.length < 20 && tries < 400; tries++) {
    const type = rng() < 0.38 ? 'heavy' : rng() < 0.72 ? 'light' : 'negative';
    const x = 180 + rng() * (w / 2 - 200), y = 160 + rng() * (h - 320), r = 42 + rng() * 40;
    if (keepClear(x, y, r) || nearObs(x, y, r + 10) || cover.some((c) => dist(x, y, c.x, c.y) < c.r + r + 30)) continue;
    cover.push({ id: 'c' + i, x, y, r, type }); i++;
    cover.push({ id: 'c' + i, x: w - x, y: h - y, r, type }); i++;
  }
  // heavy cover zones get a ruined wall that blocks movement
  for (const c of cover) if (c.type === 'heavy') {
    const a = rng() * Math.PI * 2;
    c.wallAngle = a;
    chain(obstacles, 'wall', [[c.x + Math.cos(a) * c.r * 0.55 - Math.sin(a) * 22, c.y + Math.sin(a) * c.r * 0.55 + Math.cos(a) * 22],
      [c.x + Math.cos(a) * c.r * 0.55 + Math.sin(a) * 22, c.y + Math.sin(a) * c.r * 0.55 - Math.cos(a) * 22]], 13, 11);
  }
  const map = {
    id: md.id, name: md.name, width: w, height: h,
    relays: relays.map((r) => ({ ...r, owner: null, captureAmount: 0, capturingFaction: null,
      aetherRate: r.relic ? 0 : r.critical ? 4.5 : 3.2, bastionId: null })),
    cover, obstacles, hqSpawns, bunkers: md.bunkers.map(([x, y]) => ({ x, y })),
    fields: (md.fields || []).map(([x, y, rich], i) => ({ id: 'f' + i, x, y, rich: !!rich })),
    wrecks: (md.wrecks || []).map(([x, y, amount]) => ({ x, y, amount })),
  };
  map.cols = Math.ceil(w / CELL); map.rows = Math.ceil(h / CELL);
  const n = map.cols * map.rows;
  map.walkStatic = new Uint8Array(n); map.sightStatic = new Uint8Array(n);
  for (const o of obstacles) stampCircle(map, map.walkStatic, o.x, o.y, o.r, 1);
  for (const o of obstacles) if (o.kind === 'cliff') stampCircle(map, map.sightStatic, o.x, o.y, o.r * 0.8, 1);
  return map;
}

function stampCircle(map, grid, x, y, r, v) {
  const c0 = Math.max(0, Math.floor((x - r) / CELL)), c1 = Math.min(map.cols - 1, Math.floor((x + r) / CELL));
  const r0 = Math.max(0, Math.floor((y - r) / CELL)), r1 = Math.min(map.rows - 1, Math.floor((y + r) / CELL));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const px = (cx + 0.5) * CELL, py = (cy + 0.5) * CELL;
    if (dist(px, py, x, y) <= r) grid[cy * map.cols + cx] = v;
  }
}

/* Dynamic grids: static obstacles + buildings. gridBig is inflated by one cell for vehicles. */
function rebuildGrids(state) {
  const map = state.map, n = map.cols * map.rows;
  const walk = state.walk || (state.walk = new Uint8Array(n));
  const sight = state.sight || (state.sight = new Uint8Array(n));
  walk.set(map.walkStatic); sight.set(map.sightStatic);
  for (const b of state.buildings) {
    const def = BUILDING_DEFS[b.type];
    if (b.type === 'bastion') continue; // sits on a relay; squads must still reach the point
    stampCircle(map, walk, b.x, b.y, def.size * 0.62, 1);
    if (b.complete || b.type === 'bunker') stampCircle(map, sight, b.x, b.y, def.size * 0.45, 1);
  }
  const big = state.walkBig || (state.walkBig = new Uint8Array(n));
  const C = map.cols, R = map.rows;
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    let b = walk[y * C + x];
    if (!b) for (let dy = -1; dy <= 1 && !b; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < C && yy < R && walk[yy * C + xx]) { b = 1; break; }
    }
    big[y * C + x] = b;
  }
  state.gridVersion = (state.gridVersion || 0) + 1;
}
function cellOf(map, x, y) { return clamp(Math.floor(y / CELL), 0, map.rows - 1) * map.cols + clamp(Math.floor(x / CELL), 0, map.cols - 1); }
function blockedAt(state, x, y, big) { return (big ? state.walkBig : state.walk)[cellOf(state.map, x, y)] === 1; }

function lineClear(state, grid, x0, y0, x1, y1, stepLen) {
  const d = dist(x0, y0, x1, y1), n = Math.ceil(d / (stepLen || 8));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (grid[cellOf(state.map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)]) return false;
  }
  return true;
}
/* line of sight: ignores blockers within `skip` of either end (so units next to a wall/bunker still see out) */
function losClear(state, x0, y0, x1, y1, skip0, skip1) {
  const d = dist(x0, y0, x1, y1); if (d < 1) return true;
  const n = Math.ceil(d / 14), g = state.sight;
  for (let i = 1; i < n; i++) {
    const t = i / n, along = t * d;
    if (along < (skip0 || 0) || d - along < (skip1 || 0)) continue;
    if (g[cellOf(state.map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)]) return false;
  }
  return true;
}

function nearestFree(state, x, y, big) {
  const map = state.map, grid = big ? state.walkBig : state.walk;
  const cx = clamp(Math.floor(x / CELL), 0, map.cols - 1), cy = clamp(Math.floor(y / CELL), 0, map.rows - 1);
  if (!grid[cy * map.cols + cx]) return { x, y };
  for (let r = 1; r < 40; r++) {
    let best = null, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= map.cols || yy >= map.rows || grid[yy * map.cols + xx]) continue;
      const px = (xx + 0.5) * CELL, py = (yy + 0.5) * CELL, d = dist(px, py, x, y);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return { x, y };
}

/* A* on the cell grid (8-neighbour, octile heuristic, no corner cutting) + string-pulling. */
let _astar = null;
function findPath(state, x0, y0, x1, y1, big) {
  const map = state.map, grid = big ? state.walkBig : state.walk, C = map.cols, R = map.rows, N = C * R;
  const goal = nearestFree(state, x1, y1, big);
  const startP = blockedAt(state, x0, y0, big) ? nearestFree(state, x0, y0, big) : { x: x0, y: y0 };
  if (lineClear(state, grid, startP.x, startP.y, goal.x, goal.y)) return [goal];
  if (!_astar || _astar.N !== N) _astar = { N, g: new Float32Array(N), f: new Float32Array(N), par: new Int32Array(N), mark: new Uint32Array(N), closed: new Uint32Array(N), heap: new Int32Array(N * 2), gen: 0 };
  const A = _astar; A.gen++;
  const gen = A.gen, g = A.g, f = A.f, par = A.par, mark = A.mark, closed = A.closed, heap = A.heap;
  const s = cellOf(map, startP.x, startP.y), t = cellOf(map, goal.x, goal.y);
  const tx = t % C, ty = (t / C) | 0;
  const H = (c) => { const dx = Math.abs((c % C) - tx), dy = Math.abs(((c / C) | 0) - ty); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
  let hn = 0;
  const push = (c) => { let i = hn++; heap[i] = c; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[c]) break; heap[i] = heap[p]; i = p; } heap[i] = c; };
  const pop = () => { const top = heap[0]; const last = heap[--hn]; let i = 0; for (;;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < hn && f[heap[l]] < f[last]) m = l; if (r < hn && f[heap[r]] < (m === i ? f[last] : f[heap[m]])) m = r; if (m === i) break; heap[i] = heap[m]; i = m; } if (hn > 0) heap[i] = last; return top; };
  g[s] = 0; f[s] = H(s); par[s] = -1; mark[s] = gen; push(s);
  let found = false, it = 0, bestC = s, bestH = H(s);
  while (hn > 0 && it++ < 14000) {
    const c = pop();
    if (closed[c] === gen) continue;
    closed[c] = gen;
    if (c === t) { found = true; break; }
    const hc = H(c); if (hc < bestH) { bestH = hc; bestC = c; }
    const cx = c % C, cy = (c / C) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
      const nc = ny * C + nx;
      if (grid[nc] || closed[nc] === gen) continue;
      if (dx && dy && (grid[cy * C + nx] || grid[ny * C + cx])) continue;
      const ng = g[c] + (dx && dy ? 1.4142 : 1);
      if (mark[nc] !== gen || ng < g[nc]) { mark[nc] = gen; g[nc] = ng; par[nc] = c; f[nc] = ng + H(nc); push(nc); }
    }
  }
  let end = found ? t : bestC;
  const cells = [];
  for (let c = end; c !== -1 && cells.length < 4000; c = par[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: ((c % C) + 0.5) * CELL, y: (((c / C) | 0) + 0.5) * CELL }));
  if (found) pts[pts.length - 1] = goal;
  // string pulling
  const out = []; let ax = startP.x, ay = startP.y, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !lineClear(state, grid, ax, ay, pts[j].x, pts[j].y, 6)) j--;
    out.push(pts[j]); ax = pts[j].x; ay = pts[j].y; i = j + 1;
  }
  return out.length ? out : [goal];
}
/* ------------------------------ Game state ------------------------------ */
function createPlayer(factionId, isAI, difficulty) {
  const f = FACTIONS[factionId];
  return {
    id: factionId, faction: factionId, name: f.name, isAI: !!isAI, difficulty: difficulty || 'normal',
    aether: 500, flux: 50, tier: 1, tickets: 500, hqId: null,
    research: new Set(), squadCap: BASE_SQUAD_CAP, vehicleCap: BASE_VEHICLE_CAP,
    heroDeadAt: null, heroGear: { weapon: false, ultimate: false }, lastAttackAlert: -99,
    techUnlocks: new Set(['barracks', 'generator', 'bastion', 'refinery']),
    unitUnlocks: new Set(Object.keys(UNIT_DEFS).filter((k) => UNIT_DEFS[k].faction === factionId && UNIT_DEFS[k].tier === 1)),
    stats: { killed: 0, lost: 0, built: 0, gathered: 0, salvaged: 0 }, deposits: [],
    aiState: { timer: 0, lastMacro: -99, lastArmy: -99, objective: null, aggression: difficulty === 'hard' ? 0.85 : difficulty === 'easy' ? 0.35 : 0.6, waveAt: 0 },
  };
}
function unitTypeFor(pid, role) { return (pid === 'vigilant' ? 'vig_' : 'riv_') + ({ hero: pid === 'vigilant' ? 'commander' : 'warlord' }[role] || role); }

function formationFor(def) {
  if (def.models === 1) return 'single';
  if (def.teamWeapon) return 'team';
  if (def.role === 'melee') return 'wedge';
  return 'line';
}
function layoutFormation(s) {
  const def = UNIT_DEFS[s.unitType], f = formationFor(def);
  const ms = s.models, n = ms.length;
  ms.forEach((m, i) => {
    if (f === 'single') { m.ox = 0; m.oy = 0; return; }
    if (m.leader) { m.ox = -20; m.oy = 0; return; }
    if (f === 'team') { if (i === 0) { m.ox = 8; m.oy = 0; } else { m.ox = -9; m.oy = (i % 2 ? 1 : -1) * 11 * Math.ceil(i / 2); } return; }
    if (f === 'wedge') { const k = Math.ceil(i / 2), side = i % 2 ? 1 : -1; m.ox = 8 - k * 9; m.oy = side * k * 10; return; }
    const cols = n <= 4 ? n : Math.ceil(n / 2), row = Math.floor(i / cols), col = i % cols;
    m.oy = (col - (cols - 1) / 2) * 15 + (row % 2 ? 7 : 0); m.ox = -row * 15;
  });
}
function makeModel(def, i, p) {
  const hpMult = !def.isVehicle && !def.isHero && p && p.research.has('r_hp') ? 1.2 : 1;
  const w = def.teamWeapon && i === 0 ? def.teamWeapon : def.weapon;
  return { id: nid('m'), ox: 0, oy: 0, hp: def.hp * hpMult, maxHp: def.hp * hpMult, alive: true, weapon: w, cd: 0.2 + i * 0.13, shots: 0, swings: 0 };
}

function spawnSquad(state, playerId, unitType, x, y) {
  const def = UNIT_DEFS[unitType];
  if (!def) return null;
  const p = state.players[playerId];
  const big = def.isVehicle;
  if (state.walk && blockedAt(state, x, y, big)) { const f = nearestFree(state, x, y, big); x = f.x; y = f.y; }
  const models = [];
  for (let i = 0; i < def.models; i++) models.push(makeModel(def, i, p));
  const moraleMax = def.moraleMax * (p && p.research.has('r_morale') && !def.isVehicle ? 1.3 : 1);
  const s = {
    id: nid('s'), playerId, unitType, x, y, tx: x, ty: y, vx: 0, vy: 0, models,
    modelCount: def.models, maxModels: def.models, hp: 0, maxHp: 0,
    morale: moraleMax, maxMorale: moraleMax, broken: false, suppressing: 0, suppression: 0, pinned: false,
    attackCd: 0, targetId: null, order: 'idle', stance: 'aggressive', buildTarget: null, captureRelay: null,
    reinforceCd: 0, reinforcePending: 0, reinforceT: 0, abilityCd: {}, buffs: {},
    leaderAttached: false, upgradeLevel: 0, syncKillTimer: 0, flash: 0,
    facing: playerId === 'vigilant' ? 0 : Math.PI, faceTo: null, path: null, pathGoal: null, repathT: 0,
    setup: 0, teardown: 0, inside: null, cargo: [], jump: null, revealT: 0, stealthed: !!def.infiltrate,
    lastHitT: -99, lastFireT: -99, producedFrom: null, kills: 0,
  };
  layoutFormation(s);
  recalcSquad(s);
  state.squads.push(s);
  return s;
}
function recalcSquad(s) {
  s.modelCount = 0; s.hp = 0; s.maxHp = 0;
  for (const m of s.models) { s.maxHp += m.maxHp; if (m.alive) { s.modelCount++; s.hp += m.hp; } }
}

function spawnBuilding(state, playerId, type, x, y, instant) {
  const def = BUILDING_DEFS[type];
  if (!def) return null;
  const b = {
    id: nid('b'), playerId, type, x, y, hp: instant ? def.hp : 1, maxHp: def.hp,
    buildProgress: instant ? 1 : 0, complete: !!instant, queue: [], produceCd: 0, turretCd: 0, relayId: null,
    occupant: null, flash: 0, rally: null, lastHitT: -99, shots: 0,
  };
  state.buildings.push(b);
  if (state.walk) rebuildGrids(state);
  return b;
}

function createGame(opts) {
  opts = opts || {};
  nextId = 1;
  const seed = opts.seed != null ? opts.seed : 42;
  const map = createMap(seed, opts.map || 'basin');
  const playerFaction = opts.playerFaction || 'vigilant';
  const aiFaction = playerFaction === 'vigilant' ? 'riven' : 'vigilant';
  const difficulty = opts.difficulty || 'normal';
  const state = {
    seed, tick: 0, time: 0, map, mapId: map.id,
    players: { [playerFaction]: createPlayer(playerFaction, false, difficulty), [aiFaction]: createPlayer(aiFaction, true, difficulty) },
    playerFaction, aiFaction, difficulty,
    squads: [], buildings: [], projectiles: [], effects: [], pending: [],
    winner: null, winReason: null, events: [],
    rng: mulberry32(seed ^ 0x9e3779b9), headless: !!opts.headless,
    controlVictoryEnabled: opts.controlVictory !== false, annihilationEnabled: opts.annihilation !== false,
    fogEnabled: opts.fog !== false, tutorial: !!opts.tutorial,
    visible: { vigilant: new Set(), riven: new Set() }, visT: 0,
    nodes: [],
  };
  // finite resource nodes: crystal clusters (Aether) and salvageable wrecks (Flux)
  const nrng = mulberry32(seed ^ 0x51ed);
  for (const f of map.fields) {
    const n = f.rich ? 6 : 5, amt = GATHER.nodeAmount * (f.rich ? 1.4 : 1);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + nrng() * 0.5, r = k === 0 ? 0 : 38 + nrng() * 16;
      state.nodes.push({ id: nid('n'), kind: 'aether', fieldId: f.id, x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, amount: amt, max: amt, miner: null, scale: 0.8 + nrng() * 0.5 });
    }
  }
  for (const w of map.wrecks) state.nodes.push({ id: nid('n'), kind: 'salvage', x: w.x, y: w.y, amount: w.amount, max: w.amount, miner: null, model: 'wreck', scale: 1 });
  for (const pid of [playerFaction, aiFaction]) {
    const sp = map.hqSpawns[pid], dir = pid === 'vigilant' ? 1 : -1;
    const hq = spawnBuilding(state, pid, 'hq', sp.x, sp.y, true);
    state.players[pid].hqId = hq.id;
    spawnBuilding(state, pid, 'barracks', sp.x - 105 * dir + (dir < 0 ? 0 : 0), sp.y + 105, true);
    spawnBuilding(state, pid, 'generator', sp.x - 95 * dir, sp.y - 105, true);
  }
  for (const bk of map.bunkers) spawnBuilding(state, null, 'bunker', bk.x, bk.y, true);
  rebuildGrids(state);
  for (const pid of [playerFaction, aiFaction]) {
    const sp = map.hqSpawns[pid], dir = pid === 'vigilant' ? 1 : -1;
    spawnSquad(state, pid, unitTypeFor(pid, 'hero'), sp.x + 80 * dir, sp.y);
    spawnSquad(state, pid, unitTypeFor(pid, pid === 'vigilant' ? 'scout' : 'pack'), sp.x + 130 * dir, sp.y - 50);
    spawnSquad(state, pid, unitTypeFor(pid, 'builder'), sp.x + 90 * dir, sp.y + 70);
    for (let k = 0; k < 2; k++) { const w = spawnSquad(state, pid, unitTypeFor(pid, 'worker'), sp.x + 60 * dir + k * 20, sp.y - 70); autoGather(state, w); }
    const p = state.players[pid];
    if (p.isAI && difficulty === 'hard') { p.aether += 150; p.flux += 40; }
    if (p.isAI && difficulty === 'easy') p.aether -= 100;
  }
  updateVision(state, true);
  return state;
}

/* ------------------------------ Lookups ------------------------------ */
function getPlayer(state, id) { return state.players[id]; }
function aliveModels(s) { return s.models.filter((m) => m.alive); }
function enemyOf(pid) { return pid === 'vigilant' ? 'riven' : 'vigilant'; }
function findSquad(state, id) { for (const s of state.squads) if (s.id === id) return s; return null; }
function findBuilding(state, id) { for (const b of state.buildings) if (b.id === id) return b; return null; }
function canAfford(p, a, f) { return p.aether >= a && p.flux >= (f || 0); }
function spend(p, a, f) { p.aether -= a; p.flux -= f || 0; }
function refund(p, a, f) { p.aether += a; p.flux += f || 0; }
function pushEvent(state, ev) { ev.t = state.time; state.events.push(ev); if (state.events.length > 400) state.events.splice(0, state.events.length - 300); state.eventSeq = (state.eventSeq || 0) + 1; ev.seq = state.eventSeq; }

function popUsed(state, pid) {
  let squad = 0, vehicle = 0;
  const add = (t) => { const d = UNIT_DEFS[t]; squad += d.pop || 0; vehicle += d.vpop || 0; };
  for (const s of state.squads) if (s.playerId === pid) add(s.unitType);
  for (const b of state.buildings) if (b.playerId === pid) for (const j of b.queue) if (j.kind === 'unit') add(j.unitType);
  return { squad, vehicle };
}
function relicOwner(state) { const r = state.map.relays.find((q) => q.relic); return r ? r.owner : null; }
function hasStructureNear(state, pid, x, y, r, types) {
  return state.buildings.some((b) => b.playerId === pid && b.complete && (!types || types.includes(b.type)) && dist(b.x, b.y, x, y) < r + BUILDING_DEFS[b.type].size * 0.5);
}

/* ------------------------------ Orders ------------------------------ */
function ownedSquads(state, ids) { return ids.map((id) => findSquad(state, id)).filter((s) => s && !s.jump); }
function requestPath(state, s) {
  const def = UNIT_DEFS[s.unitType];
  s.path = findPath(state, s.x, s.y, s.tx, s.ty, def.isVehicle);
  const last = s.path[s.path.length - 1];
  if (last) { s.tx = last.x; s.ty = last.y; }
  s.pathGoal = { x: s.tx, y: s.ty }; s.repathT = 0.6;
}
function leaveContainer(state, s) {
  if (!s.inside) return;
  const b = findBuilding(state, s.inside);
  const host = b || findSquad(state, s.inside);
  if (b) b.occupant = null;
  else if (host) host.cargo = host.cargo.filter((id) => id !== s.id);
  s.inside = null;
  const ang = state.rng() * Math.PI * 2;
  const p = nearestFree(state, (host ? host.x : s.x) + Math.cos(ang) * 55, (host ? host.y : s.y) + Math.sin(ang) * 55, false);
  s.x = p.x; s.y = p.y; s.tx = p.x; s.ty = p.y;
}
function issueMove(state, squadIds, x, y, attackMove, faceAngle) {
  const list = ownedSquads(state, squadIds).filter((s) => !(s.inside && !findBuilding(state, s.inside)));
  if (!list.length) return;
  x = clamp(x, 20, state.map.width - 20); y = clamp(y, 20, state.map.height - 20);
  let cx = 0, cy = 0; for (const s of list) { cx += s.x; cy += s.y; } cx /= list.length; cy /= list.length;
  const ang = faceAngle != null ? faceAngle : Math.atan2(y - cy, x - cx);
  const px = -Math.sin(ang), py = Math.cos(ang);
  // spread squads along a line perpendicular to the move direction, ordered to avoid crossing
  const sorted = list.slice().sort((a, b) => ((a.x - cx) * px + (a.y - cy) * py) - ((b.x - cx) * px + (b.y - cy) * py));
  const gap = 62;
  sorted.forEach((s, i) => {
    if (s.inside) leaveContainer(state, s);
    const k = i - (sorted.length - 1) / 2;
    const row = sorted.length > 5 ? (i % 2) : 0;
    s.tx = x + px * k * gap - Math.cos(ang) * row * 50; s.ty = y + py * k * gap - Math.sin(ang) * row * 50;
    s.order = attackMove ? 'attackMove' : 'move';
    s.targetId = null; s.buildTarget = null; s.captureRelay = null; s.loadTarget = null; s.garrisonTarget = null;
    s.faceTo = ang;
    if (s.setup >= 1) s.teardown = 0.8;
    s.setup = 0;
    requestPath(state, s);
  });
}
function issueAttack(state, squadIds, targetId) {
  let tid = targetId;
  const b = findBuilding(state, targetId);
  if (b && b.type === 'bunker' && b.occupant) tid = b.occupant;
  for (const s of ownedSquads(state, squadIds)) {
    if (s.inside && !findBuilding(state, s.inside)) continue;
    s.targetId = tid; s.order = 'attack'; s.buildTarget = null; s.captureRelay = null; s.faceTo = null;
  }
}
function issueStop(state, squadIds) {
  for (const s of ownedSquads(state, squadIds)) { s.order = 'idle'; s.tx = s.x; s.ty = s.y; s.path = null; s.targetId = null; }
}
function retreatPoint(state, s) {
  let best = null, bd = 1e9;
  for (const b of state.buildings) {
    if (b.playerId !== s.playerId || !b.complete || !(b.type === 'hq' || b.type === 'barracks')) continue;
    const d = dist(b.x, b.y, s.x, s.y); if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function issueRetreat(state, squadIds) {
  for (const s of ownedSquads(state, squadIds)) {
    if (UNIT_DEFS[s.unitType].isVehicle && !UNIT_DEFS[s.unitType].capacity && false) continue;
    if (s.inside) { if (findBuilding(state, s.inside)) leaveContainer(state, s); else continue; }
    const rp = retreatPoint(state, s);
    if (!rp) continue;
    const a = state.rng() * Math.PI * 2, r = BUILDING_DEFS[rp.type].size + 40;
    s.tx = rp.x + Math.cos(a) * r; s.ty = rp.y + Math.sin(a) * r;
    s.order = 'retreat'; s.targetId = null; s.setup = 0; s.pinned = false; s.faceTo = null;
    requestPath(state, s);
  }
}
function issueCapture(state, squadIds, relayId) {
  const relay = state.map.relays.find((r) => r.id === relayId);
  if (!relay) return;
  for (const s of ownedSquads(state, squadIds)) {
    if (!UNIT_DEFS[s.unitType].canCapture) { s.tx = relay.x; s.ty = relay.y; s.order = 'move'; requestPath(state, s); continue; }
    if (s.inside) { if (findBuilding(state, s.inside)) leaveContainer(state, s); else continue; }
    s.tx = relay.x + (state.rng() - 0.5) * 30; s.ty = relay.y + (state.rng() - 0.5) * 30;
    s.order = 'capture'; s.targetId = null; s.captureRelay = relayId; s.faceTo = null;
    requestPath(state, s);
  }
}
function issueGarrison(state, squadIds, buildingId) {
  const b = findBuilding(state, buildingId);
  if (!b || b.type !== 'bunker' || b.hp <= 0) return { ok: false, reason: 'not garrisonable' };
  let ok = false;
  for (const s of ownedSquads(state, squadIds)) {
    const def = UNIT_DEFS[s.unitType];
    if (def.isVehicle) continue;
    if (s.inside) leaveContainer(state, s);
    s.order = 'garrison'; s.garrisonTarget = b.id; s.targetId = null;
    s.tx = b.x; s.ty = b.y; requestPath(state, s); ok = true;
    break; // one squad per redoubt
  }
  return { ok };
}
function issueLoad(state, squadIds, transportId) {
  const t = findSquad(state, transportId);
  if (!t || !UNIT_DEFS[t.unitType].capacity) return { ok: false, reason: 'not a transport' };
  let n = 0;
  for (const s of ownedSquads(state, squadIds)) {
    const def = UNIT_DEFS[s.unitType];
    if (def.isVehicle || s.id === t.id || s.playerId !== t.playerId) continue;
    if (s.inside) leaveContainer(state, s);
    s.order = 'load'; s.loadTarget = t.id; s.tx = t.x; s.ty = t.y; requestPath(state, s); n++;
  }
  return { ok: n > 0 };
}
function unloadTransport(state, transportId) {
  const t = findSquad(state, transportId);
  if (!t || !t.cargo.length) return { ok: false, reason: 'empty' };
  for (const id of t.cargo.slice()) {
    const s = findSquad(state, id); if (!s) continue;
    leaveContainer(state, s); s.order = 'idle';
    pushEvent(state, { type: 'unload', playerId: s.playerId, x: s.x, y: s.y });
  }
  t.cargo = [];
  return { ok: true };
}
function setStance(state, squadIds, stance) {
  for (const s of ownedSquads(state, squadIds)) { s.stance = stance; if (stance === 'holdFire') { s.targetId = null; if (s.order === 'attack') s.order = 'idle'; } }
}

/* ------------------------------ Production ------------------------------ */
function canTrainAt(b, def) { return def.producer === b.type || (def.producer === 'barracks' && b.type === 'barracks'); }
function unitAvailability(state, pid, unitType) {
  const def = UNIT_DEFS[unitType], p = state.players[pid];
  if (!def || def.faction !== pid || def.isHero) return 'locked';
  if (p.tier < def.tier) return 'Requires Tier ' + def.tier;
  if (def.isWorker && workerCount(state, pid) >= GATHER.workerCap) return 'Worker limit (' + GATHER.workerCap + ')';
  if (def.isSuper) {
    if (relicOwner(state) !== pid) return 'Hold the Starheart Shard';
    if (state.squads.some((s) => s.playerId === pid && UNIT_DEFS[s.unitType].isSuper) || state.buildings.some((b) => b.playerId === pid && b.queue.some((j) => j.unitType === unitType))) return 'Only one at a time';
  }
  const pop = popUsed(state, pid);
  if (def.pop && pop.squad + def.pop > p.squadCap) return 'Squad cap reached';
  if (def.vpop && pop.vehicle + def.vpop > p.vehicleCap) return 'Vehicle cap reached';
  if (!canAfford(p, def.costAether, def.costFlux)) return 'resources';
  return null;
}
function queueUnit(state, buildingId, unitType) {
  const b = findBuilding(state, buildingId);
  if (!b || !b.complete) return { ok: false, reason: 'no building' };
  const def = UNIT_DEFS[unitType];
  if (!def) return { ok: false, reason: 'bad unit' };
  if (def.isHero) return { ok: false, reason: 'hero unique' };
  if (!canTrainAt(b, def)) return { ok: false, reason: 'wrong building' };
  if (b.queue.length >= 5) return { ok: false, reason: 'queue full' };
  const why = unitAvailability(state, b.playerId, unitType);
  if (why) return { ok: false, reason: why };
  spend(state.players[b.playerId], def.costAether, def.costFlux);
  b.queue.push({ kind: 'unit', unitType, remaining: def.buildTime, total: def.buildTime, aether: def.costAether, flux: def.costFlux });
  return { ok: true };
}
function researchAvailability(state, pid, rid, b) {
  const r = RESEARCH[rid], p = state.players[pid];
  if (!r) return 'bad research';
  if (b && b.type !== r.building) return 'wrong building';
  if (p.research.has(rid)) return 'Already researched';
  if (state.buildings.some((q) => q.playerId === pid && q.queue.some((j) => j.kind === 'research' && j.id === rid))) return 'In progress';
  if (p.tier < r.tier) return 'Requires Tier ' + r.tier;
  if (!canAfford(p, r.aether, r.flux)) return 'resources';
  return null;
}
function queueResearch(state, buildingId, rid) {
  const b = findBuilding(state, buildingId);
  if (!b || !b.complete) return { ok: false, reason: 'no building' };
  if (b.queue.length >= 5) return { ok: false, reason: 'queue full' };
  const why = researchAvailability(state, b.playerId, rid, b);
  if (why) return { ok: false, reason: why };
  const r = RESEARCH[rid];
  spend(state.players[b.playerId], r.aether, r.flux);
  b.queue.push({ kind: 'research', id: rid, remaining: r.time, total: r.time, aether: r.aether, flux: r.flux });
  return { ok: true };
}
function researchTier(state, playerId, tier) {
  const p = getPlayer(state, playerId);
  const hq = findBuilding(state, p.hqId);
  if (!hq) return { ok: false, reason: 'no HQ' };
  if (hq.queue.some((j) => j.kind === 'tier')) return { ok: false, reason: 'In progress' };
  if (tier !== p.tier + 1) return { ok: false, reason: 'order' };
  const t = TECH[tier];
  if (!t || !canAfford(p, t.costAether, t.costFlux)) return { ok: false, reason: 'resources' };
  if (hq.queue.length >= 5) return { ok: false, reason: 'queue full' };
  spend(p, t.costAether, t.costFlux);
  hq.queue.push({ kind: 'tier', tier, remaining: t.time, total: t.time, aether: t.costAether, flux: t.costFlux });
  return { ok: true };
}
function applyTier(state, p, tier) {
  p.tier = tier;
  for (const k of Object.keys(UNIT_DEFS)) if (UNIT_DEFS[k].faction === p.id && UNIT_DEFS[k].tier <= tier) p.unitUnlocks.add(k);
  if (tier >= 2) { p.techUnlocks.add('armory'); p.techUnlocks.add('vehicleBay'); }
  pushEvent(state, { type: 'tier', playerId: p.id, tier });
}
function cancelQueue(state, buildingId, index) {
  const b = findBuilding(state, buildingId);
  if (!b || !b.queue[index]) return { ok: false };
  const j = b.queue.splice(index, 1)[0];
  refund(state.players[b.playerId], j.aether || 0, j.flux || 0);
  return { ok: true };
}
function applyResearch(state, p, rid) {
  p.research.add(rid);
  if (rid === 'r_cap') p.squadCap += 8;
  if (rid === 'r_vcap') p.vehicleCap += 3;
  if (rid === 'r_hp') for (const s of state.squads) if (s.playerId === p.id && !UNIT_DEFS[s.unitType].isVehicle && !UNIT_DEFS[s.unitType].isHero) {
    for (const m of s.models) { m.maxHp *= 1.2; if (m.alive) m.hp *= 1.2; } recalcSquad(s);
  }
  if (rid === 'r_morale') for (const s of state.squads) if (s.playerId === p.id && !UNIT_DEFS[s.unitType].isVehicle) { s.maxMorale *= 1.3; s.morale *= 1.3; }
  pushEvent(state, { type: 'research', playerId: p.id, id: rid });
}

function footprintOk(state, type, x, y) {
  const def = BUILDING_DEFS[type];
  const r = def.size * 0.62;
  for (const o of state.map.obstacles) if (dist(o.x, o.y, x, y) < o.r + r) return false;
  if (x < r + 20 || y < r + 20 || x > state.map.width - r - 20 || y > state.map.height - r - 20) return false;
  for (const b of state.buildings) if (dist(b.x, b.y, x, y) < (BUILDING_DEFS[b.type].size + def.size) * 0.62) return false;
  return true;
}
function placementCheck(state, playerId, type, x, y) {
  const def = BUILDING_DEFS[type], p = getPlayer(state, playerId);
  if (!def || def.neutral || type === 'hq') return { ok: false, reason: 'bad type' };
  if (def.requiresTier && p.tier < def.requiresTier) return { ok: false, reason: 'Requires Tier ' + def.requiresTier };
  if (!canAfford(p, def.costAether, def.costFlux)) return { ok: false, reason: 'resources' };
  const builders = state.squads.filter((s) => s.playerId === playerId && UNIT_DEFS[s.unitType].isBuilder && !s.inside);
  if (!builders.length) return { ok: false, reason: 'no builders' };
  if (type === 'bastion') {
    const relay = state.map.relays.find((r) => !r.relic && dist(r.x, r.y, x, y) < 60 && r.owner === playerId && !r.bastionId);
    if (!relay) return { ok: false, reason: 'need an owned Relay' };
    return { ok: true, x: relay.x, y: relay.y, relay };
  }
  const fieldNear = state.nodes.some((n) => n.kind === 'aether' && dist(n.x, n.y, x, y) < 230);
  if (def.dropOff && !fieldNear) return { ok: false, reason: 'must be near a crystal field' };
  if (state.nodes.some((n) => dist(n.x, n.y, x, y) < def.size * 0.6 + 16)) return { ok: false, reason: 'blocked by resources' };
  if (def.dropOff && state.buildings.some((b) => b.hp > 0 && (b.type === 'hq' || BUILDING_DEFS[b.type].dropOff) && dist(b.x, b.y, x, y) < 200)) return { ok: false, reason: 'too close to another drop-off' };
  const near = (def.dropOff && fieldNear) || state.buildings.some((b) => b.playerId === playerId && b.complete && dist(b.x, b.y, x, y) < 340)
    || state.map.relays.some((r) => r.owner === playerId && dist(r.x, r.y, x, y) < 260);
  if (!near) return { ok: false, reason: 'too far from your territory' };
  if (state.map.relays.some((r) => dist(r.x, r.y, x, y) < 90)) return { ok: false, reason: 'too close to a Relay' };
  if (!footprintOk(state, type, x, y)) return { ok: false, reason: 'blocked' };
  return { ok: true, x, y };
}
function placeBuilding(state, playerId, type, x, y, builderIds) {
  const c = placementCheck(state, playerId, type, x, y);
  if (!c.ok) return c;
  const def = BUILDING_DEFS[type], p = getPlayer(state, playerId);
  spend(p, def.costAether, def.costFlux);
  const b = spawnBuilding(state, playerId, type, c.x, c.y, false);
  if (c.relay) { c.relay.bastionId = b.id; b.relayId = c.relay.id; }
  let builders = (builderIds || []).map((id) => findSquad(state, id)).filter((s) => s && s.playerId === playerId && UNIT_DEFS[s.unitType].isBuilder);
  if (!builders.length) {
    const all = state.squads.filter((s) => s.playerId === playerId && UNIT_DEFS[s.unitType].isBuilder && !s.inside);
    all.sort((a, bb) => (a.order === 'build' ? 1 : 0) - (bb.order === 'build' ? 1 : 0) || dist(a.x, a.y, c.x, c.y) - dist(bb.x, bb.y, c.x, c.y));
    builders = all.slice(0, 1);
  }
  for (const s of builders) assignBuild(state, s, b);
  return { ok: true, building: b };
}
function assignBuild(state, s, b) {
  const a = Math.atan2(s.y - b.y, s.x - b.x), r = BUILDING_DEFS[b.type].size * 0.62 + 26;
  s.order = 'build'; s.buildTarget = b.id; s.targetId = null;
  s.tx = b.x + Math.cos(a) * r; s.ty = b.y + Math.sin(a) * r;
  requestPath(state, s);
}

function reinforceCheck(state, s) {
  const def = UNIT_DEFS[s.unitType];
  if (def.isVehicle || def.isHero) return 'cannot reinforce';
  if (s.inside && !findBuilding(state, s.inside)) return 'inside a transport';
  if (s.modelCount + s.reinforcePending >= s.maxModels) return 'full';
  const nearBase = hasStructureNear(state, s.playerId, s.x, s.y, 320, ['hq', 'barracks', 'bastion']);
  if (nearBase) return null;
  const quiet = state.time - s.lastHitT > 8 && state.time - s.lastFireT > 5;
  const territory = state.map.relays.some((r) => r.owner === s.playerId && dist(r.x, r.y, s.x, s.y) < 420);
  if (quiet && territory) return null;
  return quiet ? 'outside your territory' : 'in combat - fall back to a structure';
}
function reinforceSquad(state, squadId) {
  const s = findSquad(state, squadId);
  if (!s) return { ok: false, reason: 'no squad' };
  const def = UNIT_DEFS[s.unitType];
  const why = reinforceCheck(state, s);
  if (why) return { ok: false, reason: why };
  const p = getPlayer(state, s.playerId);
  if (!canAfford(p, def.reinforceCost, 0)) return { ok: false, reason: 'resources' };
  spend(p, def.reinforceCost, 0);
  s.reinforcePending++;
  if (s.reinforceT <= 0) s.reinforceT = def.reinforceTime;
  return { ok: true };
}
function upgradeSquad(state, squadId) {
  const s = findSquad(state, squadId);
  if (!s) return { ok: false, reason: 'no squad' };
  const def = UNIT_DEFS[s.unitType];
  if (def.isHero || def.isVehicle || def.isBuilder || def.teamWeapon || def.infiltrate) return { ok: false, reason: 'cannot take a leader' };
  if (s.leaderAttached) return { ok: false, reason: 'already has a leader' };
  const p = getPlayer(state, s.playerId);
  if (!canAfford(p, UPGRADE_COST.aether, UPGRADE_COST.flux)) return { ok: false, reason: 'resources' };
  spend(p, UPGRADE_COST.aether, UPGRADE_COST.flux);
  s.leaderAttached = true; s.upgradeLevel = 1;
  s.maxMorale = Math.round(s.maxMorale * 1.4); s.morale = Math.min(s.maxMorale, s.morale + 30);
  const m = makeModel(def, 1, p); m.leader = true; m.maxHp *= 1.8; m.hp = m.maxHp;
  s.models.push(m); s.maxModels += 1;
  layoutFormation(s); recalcSquad(s);
  return { ok: true };
}
function wargearCount(s, wid) { return s.models.filter((m) => m.alive && m.weapon === wid).length; }
function addWargear(state, squadId, wid) {
  const s = findSquad(state, squadId);
  if (!s) return { ok: false, reason: 'no squad' };
  const def = UNIT_DEFS[s.unitType], p = state.players[s.playerId];
  const opt = def.wargear.find((w) => w.id === wid);
  if (!opt) return { ok: false, reason: 'not available' };
  if (p.tier < opt.tier) return { ok: false, reason: 'Requires Tier ' + opt.tier };
  if (wargearCount(s, wid) >= opt.max) return { ok: false, reason: 'max ' + opt.max };
  const used = s.models.filter((m) => m.alive && m.weapon !== def.weapon && m.weapon !== def.teamWeapon).length;
  if (used >= def.wargearSlots) return { ok: false, reason: 'no free slots' };
  const m = s.models.find((q) => q.alive && !q.leader && q.weapon === def.weapon) || s.models.find((q) => q.alive && q.weapon === def.weapon);
  if (!m) return { ok: false, reason: 'no model to arm' };
  if (!canAfford(p, opt.aether, opt.flux)) return { ok: false, reason: 'resources' };
  spend(p, opt.aether, opt.flux);
  m.weapon = wid; m.cd = 0.5;
  return { ok: true };
}
function buyHeroGear(state, squadId, slot) {
  const s = findSquad(state, squadId);
  if (!s || !UNIT_DEFS[s.unitType].isHero) return { ok: false, reason: 'select your commander' };
  const p = state.players[s.playerId], g = HERO_GEAR[s.playerId][slot];
  if (!g) return { ok: false, reason: 'bad slot' };
  if (p.heroGear[slot]) return { ok: false, reason: 'already equipped' };
  if (p.tier < g.tier) return { ok: false, reason: 'Requires Tier ' + g.tier };
  if (slot === 'ultimate' && !p.heroGear.weapon) return { ok: false, reason: 'needs ' + HERO_GEAR[s.playerId].weapon.name + ' first' };
  if (!canAfford(p, g.aether, g.flux)) return { ok: false, reason: 'resources' };
  spend(p, g.aether, g.flux);
  p.heroGear[slot] = true;
  applyHeroGear(s, p);
  pushEvent(state, { type: 'heroGear', playerId: p.id, slot });
  return { ok: true };
}
function applyHeroGear(s, p) {
  const def = UNIT_DEFS[s.unitType];
  const hpMult = p.heroGear.ultimate ? 1.6 : 1;
  const m = s.models[0];
  const frac = m.hp / m.maxHp;
  m.maxHp = def.hp * hpMult; m.hp = m.maxHp * frac;
  recalcSquad(s);
}

/* ------------------------------ Abilities ------------------------------ */
function abilityReady(state, s, aid) {
  const def = UNIT_DEFS[s.unitType], a = ABILITIES[aid];
  if (!a || !def.abilities.includes(aid)) return 'not available';
  if (a.research && !state.players[s.playerId].research.has(a.research)) return 'Research ' + RESEARCH[a.research].name[s.playerId];
  if ((s.abilityCd[aid] || 0) > 0) return 'recharging';
  if (s.inside || s.jump) return 'busy';
  if (s.broken || s.order === 'retreat') return 'retreating';
  return null;
}
function useAbility(state, squadId, aid, x, y) {
  const s = findSquad(state, squadId);
  if (!s) return { ok: false, reason: 'no squad' };
  const why = abilityReady(state, s, aid);
  if (why) return { ok: false, reason: why };
  const a = ABILITIES[aid];
  if (a.target === 'point') {
    if (x == null) {
      let best = null, bd = a.range;
      for (const e of state.squads) {
        if (e.playerId === s.playerId || e.inside && !findBuilding(state, e.inside) || !isVisibleTo(state, s.playerId, e)) continue;
        const d = dist(s.x, s.y, e.x, e.y); if (d < bd) { bd = d; best = e; }
      }
      if (!best) return { ok: false, reason: 'no target in range' };
      x = best.x; y = best.y;
    }
    const d = dist(s.x, s.y, x, y);
    if (d > a.range) { const k = a.range / d; x = s.x + (x - s.x) * k; y = s.y + (y - s.y) * k; }
  }
  s.abilityCd[aid] = a.cd;
  s.abilityMax = s.abilityMax || {}; s.abilityMax[aid] = a.cd;
  const pid = s.playerId;
  if (aid === 'ordnance') {
    state.pending.push({ kind: 'blast', t: a.delay, x, y, r: a.radius, damage: a.damage, wtype: 'explosive', owner: pid, from: s.id, fx: 'strike' });
    state.effects.push({ type: 'strikeMark', x, y, t: a.delay, r: a.radius, faction: pid });
  } else if (aid === 'frag' || aid === 'firebomb') {
    state.projectiles.push({ id: nid('p'), x: s.x, y: s.y, sx: s.x, sy: s.y, tx: x, ty: y, speed: dist(s.x, s.y, x, y) / a.delay, arc: true, t: 0, dur: a.delay,
      damage: a.damage, wtype: a.flame ? 'flame' : 'explosive', splash: a.radius, ownerId: pid, from: s.id, faction: pid, fx: a.flame ? 'firebomb' : 'grenade', life: a.delay + 0.5 });
    s.lastFireT = state.time; s.revealT = 3;
  } else if (aid === 'rally') {
    for (const al of state.squads) if (al.playerId === pid && dist(al.x, al.y, s.x, s.y) < a.radius) {
      al.morale = Math.min(al.maxMorale, al.morale + 55); al.broken = false; al.suppression = 0; al.pinned = false;
    }
    state.effects.push({ type: 'aura', x: s.x, y: s.y, t: 1, r: a.radius, faction: pid });
  } else if (aid === 'howl') {
    for (const e of state.squads) if (e.playerId !== pid && !e.inside && dist(e.x, e.y, s.x, s.y) < a.radius) {
      e.morale -= 40; if (!UNIT_DEFS[e.unitType].isVehicle && !UNIT_DEFS[e.unitType].isHero) e.suppression = Math.min(140, e.suppression + 60); e.lastHitT = state.time;
    }
    state.effects.push({ type: 'aura', x: s.x, y: s.y, t: 1, r: a.radius, faction: pid });
  } else if (aid === 'rampage' || aid === 'brace' || aid === 'charge') {
    s.buffs[aid] = a.duration;
    if (aid === 'brace') { s.tx = s.x; s.ty = s.y; s.path = null; s.suppression = 0; s.pinned = false; }
    if (aid === 'charge') { s.suppression = 0; s.pinned = false; s.chargeHits = 1; }
    s.rampageT = aid === 'rampage' ? a.duration : s.rampageT;
  } else if (aid === 'leap') {
    const land = nearestFree(state, x, y, false);
    s.jump = { fx: s.x, fy: s.y, tx: land.x, ty: land.y, t: 0, dur: a.duration };
    s.facing = Math.atan2(land.y - s.y, land.x - s.x);
    s.path = null; s.order = 'idle'; s.targetId = null; s.inside = null;
  }
  pushEvent(state, { type: 'ability', playerId: pid, id: aid, squadId: s.id, x: x != null ? x : s.x, y: y != null ? y : s.y });
  return { ok: true, x, y };
}
/* ------------------------------ Vision / fog / detection ------------------------------ */
function sightOf(state, pid, def, isBuilding) {
  const m = state.players[pid] && state.players[pid].research.has('r_sight') ? 1.25 : 1;
  return (def.sight || 260) * m;
}
function viewersOf(state, pid) {
  const out = [];
  const allDetect = state.players[pid].research.has('r_sight');
  for (const s of state.squads) {
    if (s.playerId !== pid || s.modelCount === 0) continue;
    if (s.inside && !findBuilding(state, s.inside)) continue; // inside a transport
    const def = UNIT_DEFS[s.unitType];
    out.push({ x: s.x, y: s.y, r: sightOf(state, pid, def) + (s.inside ? 40 : 0), det: def.detector ? 240 : allDetect ? 130 : 0, skip: s.inside ? 40 : 12 });
  }
  for (const b of state.buildings) {
    if (b.playerId !== pid || !b.complete) continue;
    const def = BUILDING_DEFS[b.type];
    out.push({ x: b.x, y: b.y, r: sightOf(state, pid, def), det: def.detector ? 260 : 0, skip: def.size * 0.6 });
  }
  return out;
}
function updateVision(state, force) {
  state.visT -= DT;
  if (state.visT > 0 && !force) return;
  state.visT = 0.25;
  for (const pid of Object.keys(state.players)) {
    const vis = new Set(), V = viewersOf(state, pid);
    for (const e of state.squads) {
      if (e.playerId === pid || e.modelCount === 0) continue;
      if (e.inside && !findBuilding(state, e.inside)) continue;
      const stealth = e.stealthed && !e.inside;
      const skip1 = e.inside ? 40 : 12;
      for (const v of V) {
        const d = dist(v.x, v.y, e.x, e.y);
        if (d > v.r) continue;
        if (stealth && d > 45 && !(v.det && d <= v.det)) continue;
        if (!losClear(state, v.x, v.y, e.x, e.y, v.skip, skip1)) continue;
        vis.add(e.id); break;
      }
    }
    for (const b of state.buildings) {
      if (b.playerId === pid) continue;
      const sz = BUILDING_DEFS[b.type].size * 0.6;
      for (const v of V) {
        const d = dist(v.x, v.y, b.x, b.y) - sz;
        if (d > v.r) continue;
        if (!losClear(state, v.x, v.y, b.x, b.y, v.skip, sz + 10)) continue;
        vis.add(b.id); break;
      }
    }
    state.visible[pid] = vis;
  }
}
function isVisibleTo(state, pid, obj) {
  if (!obj) return false;
  if (obj.playerId === pid) return true;
  if (obj.playerId == null) return true; // neutral structures
  return state.visible[pid] ? state.visible[pid].has(obj.id) : true;
}
/* Fog grid for rendering: 2 = visible now, 1 = explored. `out` persists between calls (explored memory). */
function computeFog(state, pid, out) {
  const map = state.map, C = Math.ceil(map.width / FOG_CELL), R = Math.ceil(map.height / FOG_CELL);
  if (!out || out.length !== C * R) out = new Uint8Array(C * R);
  for (let i = 0; i < out.length; i++) if (out[i] === 2) out[i] = 1;
  for (const v of viewersOf(state, pid)) {
    const r = v.r, c0 = Math.max(0, Math.floor((v.x - r) / FOG_CELL)), c1 = Math.min(C - 1, Math.floor((v.x + r) / FOG_CELL));
    const r0 = Math.max(0, Math.floor((v.y - r) / FOG_CELL)), r1 = Math.min(R - 1, Math.floor((v.y + r) / FOG_CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const i = cy * C + cx; if (out[i] === 2) continue;
      const px = (cx + 0.5) * FOG_CELL, py = (cy + 0.5) * FOG_CELL;
      if (dist(px, py, v.x, v.y) > r) continue;
      if (losClear(state, v.x, v.y, px, py, v.skip, 20)) out[i] = 2;
    }
  }
  return { data: out, cols: C, rows: R, cell: FOG_CELL };
}

/* ------------------------------ Cover ------------------------------ */
function coverAt(map, x, y) {
  let best = null;
  for (const c of map.cover) if (dist(x, y, c.x, c.y) <= c.r) {
    if (!best || c.type === 'heavy' || (c.type === 'light' && best.type === 'negative')) best = c;
  }
  return best ? best.type : null;
}
function coverDamageMult(type) { return type === 'heavy' ? 0.5 : type === 'light' ? 0.72 : type === 'negative' ? 1.3 : 1; }

/* ------------------------------ Damage ------------------------------ */
function damageMult(wtype, armor) { const row = DAMAGE_TABLE[wtype] || DAMAGE_TABLE.small; return row[armor] != null ? row[armor] : 1; }
function alertAttack(state, pid, x, y) {
  const p = state.players[pid];
  if (!p || state.time - p.lastAttackAlert < 12) return;
  p.lastAttackAlert = state.time;
  pushEvent(state, { type: 'underAttack', playerId: pid, x, y });
}
// Back-compat signature: (state, target, rawDamage, pierce|wtype, attacker, isExplosive)
function dealDamageToSquad(state, target, raw, wtype, attacker, isExplosive, opts) {
  if (!target || target.modelCount === 0) return 0;
  opts = opts || {};
  if (typeof wtype !== 'string') wtype = isExplosive ? 'explosive' : 'small';
  const def = UNIT_DEFS[target.unitType];
  const melee = wtype === 'melee' || wtype === 'powerMelee';
  let mult = damageMult(wtype, def.armor);
  const bunker = target.inside ? findBuilding(state, target.inside) : null;
  const cover = bunker ? 'garrison' : coverAt(state.map, target.x, target.y);
  if (!melee) {
    if (bunker) mult *= wtype === 'flame' ? 1.6 : wtype === 'explosive' || wtype === 'cannon' ? 0.8 : 0.45;
    else if (!opts.ignoresCover) mult *= coverDamageMult(cover);
  }
  if (target.order === 'retreat') mult *= 0.6;
  if (target.buffs.brace > 0) mult *= 0.6;
  if (target.jump) mult *= 0.5;
  if (target.broken) mult *= 1.15;
  if (attacker) {
    if (attacker.broken) mult *= 0.5;
    if (attacker.rampageT > 0 || (attacker.buffs && attacker.buffs.rampage > 0)) mult *= 1.5;
  }
  const dmg = raw * mult;
  if (dmg <= 0) return 0;
  // spread damage: splash hits up to 3 models, single shots hit one random model
  const alive = target.models.filter((m) => m.alive);
  const hits = opts.spread ? Math.min(alive.length, 3) : 1;
  let killed = 0;
  for (let h = 0; h < hits; h++) {
    const live = target.models.filter((m) => m.alive);
    if (!live.length) break;
    const m = live[Math.floor(state.rng() * live.length)];
    m.hp -= dmg / hits;
    if (m.hp <= 0) {
      m.alive = false; m.hp = 0; killed++;
      state.effects.push({ type: 'death', x: target.x + m.ox, y: target.y + m.oy, t: 0.5, faction: target.playerId, wtype });
    }
  }
  if (bunker && (wtype === 'explosive' || wtype === 'cannon' || wtype === 'lance')) dealDamageToBuilding(state, bunker, raw * 0.4, wtype);
  recalcSquad(target);
  target.flash = 0.15;
  target.lastHitT = state.time;
  if (attacker) { attacker.kills += killed; state.players[attacker.playerId].stats.killed += killed; }
  state.players[target.playerId].stats.lost += killed;
  if (!def.isVehicle) {
    const wm = (WEAPONS[opts.weapon] && WEAPONS[opts.weapon].morale) || (wtype === 'flame' ? 1.6 : 1);
    target.morale -= (dmg / Math.max(1, target.maxHp)) * 60 * wm + killed * (wtype === 'sniper' ? 14 : 4) + (wtype === 'explosive' ? 8 : 0);
    if (opts.suppress && !bunker && def.armor !== 'commander' && !(target.buffs.brace > 0) && !(target.buffs.charge > 0) && !target.jump && target.order !== 'retreat') {
      const cm = cover === 'heavy' ? 0.6 : cover === 'light' ? 0.8 : cover === 'negative' ? 1.3 : 1;
      target.suppression = Math.min(150, target.suppression + opts.suppress * cm * (def.armor === 'heavy' ? 0.5 : 1));
      target.lastSuppressT = state.time;
    }
  }
  target.suppressing = Math.max(target.suppressing, cover === 'negative' ? 1.5 : 0.8);
  alertAttack(state, target.playerId, target.x, target.y);
  if (target.modelCount === 0) killSquad(state, target);
  return dmg;
}
function killSquad(state, s) {
  const def = UNIT_DEFS[s.unitType];
  state.effects.push({ type: 'explosion', x: s.x, y: s.y, t: def.isVehicle ? 1 : 0.4, r: def.isVehicle ? (def.isSuper ? 120 : 70) : 30 });
  const idx = state.squads.indexOf(s);
  if (idx >= 0) state.squads.splice(idx, 1);
  if (s.gNodeHeld) { const n = findNode(state, s.gNodeHeld); if (n && n.miner === s.id) n.miner = null; }
  if (def.isVehicle && !s.inside) salvageFromVehicle(state, s, def);
  if (s.inside) { const b = findBuilding(state, s.inside); if (b) b.occupant = null; else { const t = findSquad(state, s.inside); if (t) t.cargo = t.cargo.filter((q) => q !== s.id); } }
  if (def.capacity && s.cargo.length) {
    for (const id of s.cargo.slice()) {
      const c = findSquad(state, id); if (!c) continue;
      c.inside = null; const a = state.rng() * 6.28, p = nearestFree(state, s.x + Math.cos(a) * 40, s.y + Math.sin(a) * 40, false);
      c.x = p.x; c.y = p.y; c.tx = p.x; c.ty = p.y; c.order = 'idle';
      for (const m of c.models) if (m.alive) m.hp *= 0.6;
      recalcSquad(c); c.morale -= 30;
    }
    s.cargo = [];
  }
  if (def.isHero) { state.players[s.playerId].heroDeadAt = state.time; pushEvent(state, { type: 'heroDown', playerId: s.playerId, x: s.x, y: s.y }); }
  else pushEvent(state, { type: 'squadLost', playerId: s.playerId, unitType: s.unitType, x: s.x, y: s.y });
}
function dealDamageToBuilding(state, b, raw, wtype) {
  if (!b || b.hp <= 0) return 0;
  if (typeof wtype !== 'string') wtype = 'small';
  const dmg = raw * damageMult(wtype, 'building');
  b.hp -= dmg; b.flash = 0.12; b.lastHitT = state.time;
  if (b.playerId) alertAttack(state, b.playerId, b.x, b.y);
  if (b.hp <= 0) destroyBuilding(state, b);
  return dmg;
}
function destroyBuilding(state, b) {
  b.hp = 0;
  if (b.relayId) { const relay = state.map.relays.find((r) => r.id === b.relayId); if (relay) relay.bastionId = null; }
  if (b.occupant) { const s = findSquad(state, b.occupant); if (s) { leaveContainer(state, s); for (const m of s.models) if (m.alive) m.hp *= 0.7; recalcSquad(s); s.morale -= 30; } }
  for (const s of state.squads) if (s.buildTarget === b.id) { s.buildTarget = null; s.order = 'idle'; }
  const idx = state.buildings.indexOf(b);
  if (idx >= 0) state.buildings.splice(idx, 1);
  state.effects.push({ type: 'explosion', x: b.x, y: b.y, t: 1, r: 80 });
  rebuildGrids(state);
  if (b.playerId) pushEvent(state, { type: 'buildingLost', playerId: b.playerId, buildingType: b.type, x: b.x, y: b.y });
  if (b.type === 'hq' && state.annihilationEnabled && !state.winner) { state.winner = enemyOf(b.playerId); state.winReason = 'annihilation'; }
}
function applySplash(state, x, y, r, damage, wtype, owner, attacker, extra) {
  for (const e of state.squads.slice()) {
    if (e.playerId === owner || e.modelCount === 0) continue;
    if (e.inside && !findBuilding(state, e.inside)) continue;
    const d = dist(x, y, e.x, e.y);
    if (d > r + 14) continue;
    const k = 1 - 0.55 * Math.min(1, d / (r + 14));
    dealDamageToSquad(state, e, damage * k, wtype, attacker, wtype === 'explosive', { spread: true, ignoresCover: wtype === 'flame', suppress: extra && extra.suppress, weapon: extra && extra.weapon });
  }
  for (const b of state.buildings.slice()) {
    if (b.playerId === owner || (b.playerId == null && !b.occupant)) continue;
    if (dist(x, y, b.x, b.y) < r + BUILDING_DEFS[b.type].size * 0.5) dealDamageToBuilding(state, b, damage * 0.6, wtype);
  }
}

/* ------------------------------ Combat ------------------------------ */
function weaponOf(id) { return WEAPONS[id] || WEAPONS.fists; }
function engageRange(s) {
  const def = UNIT_DEFS[s.unitType];
  if (def.role === 'melee' || def.meleeFirst) {
    // melee squads with ranged wargear still charge into contact
    return 30;
  }
  let r = 0;
  for (const m of s.models) if (m.alive) { const w = weaponOf(m.weapon); if (!w.melee) r = Math.max(r, w.range); }
  return (r || 30) + (s.inside ? 40 : 0);
}
function acquireTarget(state, s, range, wantBuildings) {
  let best = null, bd = range, bestB = null, bbd = range;
  for (const e of state.squads) {
    if (e.playerId === s.playerId || e.modelCount === 0) continue;
    if (e.inside && !findBuilding(state, e.inside)) continue;
    if (!isVisibleTo(state, s.playerId, e)) continue;
    const d = dist(s.x, s.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) return best;
  if (!wantBuildings) return null;
  for (const b of state.buildings) {
    if (b.playerId === s.playerId || b.playerId == null || !isVisibleTo(state, s.playerId, b)) continue;
    const d = dist(s.x, s.y, b.x, b.y) - BUILDING_DEFS[b.type].size * 0.5;
    if (d < bbd) { bbd = d; bestB = b; }
  }
  return bestB;
}
function setDest(state, s, x, y) {
  if (s.pathGoal && dist(s.pathGoal.x, s.pathGoal.y, x, y) < 30 && s.path && s.path.length) return;
  if (s.repathT > 0 && s.path && s.path.length) return;
  s.tx = x; s.ty = y; requestPath(state, s);
}
function updateCombat(state, s, dt) {
  const def = UNIT_DEFS[s.unitType];
  s.attackCd = Math.max(0, s.attackCd - dt);
  if (s.rampageT > 0) s.rampageT -= dt;
  for (const m of s.models) if (m.alive && m.cd > 0) m.cd -= dt;
  if (s.jump || (s.inside && !findBuilding(state, s.inside))) return;
  if (s.order === 'retreat' || s.broken) return;
  if (def.isBuilder && s.order === 'build') return;
  if (def.isWorker && s.order === 'gather') return;
  let target = null;
  if (s.order === 'attack' && s.targetId) {
    target = findSquad(state, s.targetId) || findBuilding(state, s.targetId);
    if (!target || (target.modelCount === 0) || target.hp <= 0) { s.order = 'idle'; s.targetId = null; target = null; }
    else if (!isVisibleTo(state, s.playerId, target)) {
      // lost sight: move to last known position, then give up
      if (s.lastSeen && dist(s.x, s.y, s.lastSeen.x, s.lastSeen.y) > 30) setDest(state, s, s.lastSeen.x, s.lastSeen.y);
      else { s.order = 'idle'; s.targetId = null; }
      target = null;
    } else s.lastSeen = { x: target.x, y: target.y };
  }
  const R = engageRange(s);
  if (!target && s.order === 'capture' && s.captureRelay) {
    const relay = state.map.relays.find((r) => r.id === s.captureRelay);
    const bas = relay && relay.bastionId ? findBuilding(state, relay.bastionId) : null;
    if (bas && bas.playerId !== s.playerId && isVisibleTo(state, s.playerId, bas)) target = bas;
  }
  const hitRecently = state.time - s.lastHitT < 2.5;
  if (!target && s.stance !== 'holdFire' && s.order !== 'load' && s.order !== 'garrison') {
    s.acqT = (s.acqT || 0) - dt;
    if (s.acqT <= 0 || !s.autoTarget) {
      s.acqT = 0.3;
      const chase = s.stance === 'aggressive' && (s.order === 'idle' || s.order === 'attackMove' || (s.order === 'capture' && hitRecently)) && !s.inside;
      s.autoTarget = acquireTarget(state, s, R + (chase ? (def.role === 'melee' ? 170 : 90) : 0) + (def.meleeFirst ? 60 : 0), s.order !== 'capture');
      s.autoTarget = s.autoTarget ? s.autoTarget.id : null;
    }
    if (s.autoTarget) {
      target = findSquad(state, s.autoTarget) || findBuilding(state, s.autoTarget);
      if (!target || target.modelCount === 0 || target.hp <= 0 || !isVisibleTo(state, s.playerId, target)) { target = null; s.autoTarget = null; }
    }
  }
  if (!target) {
    if (s.order === 'capture' && s.captureRelay && s.pathGoal) {
      const relay = state.map.relays.find((r) => r.id === s.captureRelay);
      if (relay && dist(s.pathGoal.x, s.pathGoal.y, relay.x, relay.y) > 60) { s.repathT = 0; setDest(state, s, relay.x, relay.y); }
    }
    return;
  }
  const isB = target.type && BUILDING_DEFS[target.type];
  const tsz = isB ? BUILDING_DEFS[target.type].size * 0.55 : 0;
  const d = dist(s.x, s.y, target.x, target.y) - tsz;
  const canChase = !s.inside && !(s.buffs.brace > 0) && (s.order === 'attack' || (s.stance === 'aggressive' && (s.order === 'idle' || s.order === 'attackMove' || (s.order === 'capture' && (hitRecently || isB) && (def.role === 'melee' || def.meleeFirst || isB)))));
  if (d > R) {
    if (canChase && !s.pinned) {
      if (s.setup >= 1) { s.teardown = 0.8; s.setup = 0; }
      setDest(state, s, target.x, target.y);
    }
    if (!(d <= R + 200 && s.models.some((m) => m.alive && !weaponOf(m.weapon).melee && d <= weaponOf(m.weapon).range))) return;
  } else if (s.order !== 'capture' && !s.inside) {
    if (s.path && s.path.length) { s.path = null; s.tx = s.x; s.ty = s.y; }
  }
  const moving = Math.abs(s.vx) + Math.abs(s.vy) > 1;
  s.facing = Math.atan2(target.y - s.y, target.x - s.x);
  // weapon team set-up
  if (def.teamWeapon && !moving && s.teardown <= 0) {
    const tw = weaponOf(def.teamWeapon);
    if (d <= tw.range + (s.inside ? 40 : 0)) s.setup = Math.min(1, s.setup + dt / (s.inside ? tw.setup * 0.5 : tw.setup));
  }
  const p = state.players[s.playerId];
  let mult = 1 + s.upgradeLevel * 0.15;
  if (def.isHero) mult *= (p.heroGear.weapon ? 1.5 : 1) * (p.heroGear.ultimate ? 1.25 : 1);
  if (s.pinned) mult *= 0.3; else if (s.suppression >= 45) mult *= 0.6;
  const contact = d <= 42;
  let meleeFx = false;
  for (let i = 0; i < s.models.length; i++) {
    const m = s.models[i];
    if (!m.alive || m.cd > 0) continue;
    let w = weaponOf(m.weapon), wid = m.weapon;
    if (contact && !w.melee && !(def.isVehicle && !weaponOf(def.meleeWeapon).melee)) { wid = def.meleeWeapon; w = weaponOf(wid); }
    if (w.melee && !contact) continue;
    if (!w.melee && d > w.range + (s.inside ? 40 : 0)) continue;
    if (w.setup && s.setup < 1) continue;
    if (w.type === 'sniper' && moving) continue;
    m.cd = w.cooldown * (0.85 + state.rng() * 0.3);
    s.lastFireT = state.time;
    if (def.infiltrate) { s.revealT = 3; s.stealthed = false; }
    let dmg = w.damage * mult * (0.85 + state.rng() * 0.3);
    if (s.buffs.charge > 0 && s.chargeHits > 0 && w.melee) dmg *= 2;
    s.attackCd = 0.25;
    if (w.melee) {
      m.swings++;
      s.syncKillTimer = 0.35;
      if (!meleeFx) { meleeFx = true; state.effects.push({ type: 'melee', x: (s.x + target.x) / 2, y: (s.y + target.y) / 2, t: 0.35, faction: s.playerId, heavy: w.type === 'powerMelee' }); }
      if (isB) dealDamageToBuilding(state, target, dmg, w.type);
      else dealDamageToSquad(state, target, dmg, w.type, s, false, { weapon: wid });
      if (target.modelCount === 0 || target.hp <= 0) break;
    } else {
      m.shots++;
      const ox = Math.cos(s.facing) * m.ox - Math.sin(s.facing) * m.oy, oy = Math.sin(s.facing) * m.ox + Math.cos(s.facing) * m.oy;
      const sx = s.inside ? s.x : s.x + ox * 1.7, sy = s.inside ? s.y : s.y + oy * 1.7;
      const spd = w.fx === 'beam' || w.fx === 'snipe' ? 4000 : w.fx === 'shell' ? 520 : w.fx === 'flame' ? 300 : 650;
      const jx = isB ? (state.rng() - 0.5) * tsz : (state.rng() - 0.5) * 26, jy = isB ? (state.rng() - 0.5) * tsz : (state.rng() - 0.5) * 26;
      state.projectiles.push({ id: nid('p'), x: sx, y: sy, tx: target.x + jx, ty: target.y + jy, speed: spd, damage: dmg, wtype: w.type, weapon: wid,
        splash: w.splash || 0, suppress: w.suppress || 0, ignoresCover: !!w.ignoresCover, ownerId: s.playerId, from: s.id, faction: s.playerId, fx: w.fx,
        targetSquadId: isB ? null : target.id, targetBuildingId: isB ? target.id : null, life: 1.5 });
    }
  }
  if (meleeFx && s.chargeHits > 0) s.chargeHits = 0;
}

/* ------------------------------ Morale & suppression ------------------------------ */
function updateMorale(state, s, dt) {
  const def = UNIT_DEFS[s.unitType];
  if (def.isVehicle) { s.morale = s.maxMorale; s.broken = false; s.suppression = 0; s.pinned = false; return; }
  const quiet = state.time - s.lastHitT > 4;
  if (quiet) s.morale = Math.min(s.maxMorale, s.morale + dt * 8);
  if (s.order === 'retreat') s.morale = Math.min(s.maxMorale, s.morale + dt * 22);
  if (hasStructureNear(state, s.playerId, s.x, s.y, 200, ['hq', 'barracks'])) {
    s.morale = Math.min(s.maxMorale, s.morale + dt * 15);
    if (quiet) { for (const m of s.models) if (m.alive && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.03 * dt); recalcSquad(s); }
  }
  s.suppressing = Math.max(0, s.suppressing - dt);
  if (state.time - (s.lastSuppressT || -99) > 1.2) s.suppression = Math.max(0, s.suppression - dt * 22);
  if (s.suppression >= 100) s.pinned = true; else if (s.suppression < 45) s.pinned = false;
  if (s.morale <= 0 && !s.broken) {
    s.broken = true; s.morale = 0;
    pushEvent(state, { type: 'broken', playerId: s.playerId, x: s.x, y: s.y });
    if (s.order !== 'retreat') { const o = s.order; issueRetreat(state, [s.id]); if (s.order !== 'retreat') s.order = o; }
  }
  if (s.broken && s.morale >= s.maxMorale * 0.6) s.broken = false;
}

/* ------------------------------ Movement ------------------------------ */
function speedOf(state, s) {
  const def = UNIT_DEFS[s.unitType];
  let v = def.speed;
  if (s.order === 'retreat') v *= 1.5;
  else if (s.suppression >= 45 && !s.pinned) v *= 0.55;
  if (s.rampageT > 0) v *= 1.25;
  if (s.buffs.charge > 0) v *= 1.8;
  if (def.teamWeapon && s.setup > 0) v *= 0.8;
  return v;
}
function updateMovement(state, s, dt) {
  const def = UNIT_DEFS[s.unitType];
  if (s.inside) {
    const host = findBuilding(state, s.inside) || findSquad(state, s.inside);
    if (host) { s.x = host.x; s.y = host.y; } else s.inside = null;
    s.vx = s.vy = 0; return;
  }
  if (s.jump) {
    const j = s.jump; j.t += dt;
    const k = Math.min(1, j.t / j.dur);
    s.x = j.fx + (j.tx - j.fx) * k; s.y = j.fy + (j.ty - j.fy) * k; s.vx = (j.tx - j.fx) / j.dur; s.vy = (j.ty - j.fy) / j.dur;
    if (k >= 1) {
      s.jump = null; s.vx = s.vy = 0; s.tx = s.x; s.ty = s.y; s.path = null;
      const a = ABILITIES.leap;
      applySplash(state, s.x, s.y, a.radius, a.damage, 'explosive', s.playerId, s);
      state.effects.push({ type: 'land', x: s.x, y: s.y, t: 0.6, r: a.radius, faction: s.playerId });
    }
    return;
  }
  if (s.teardown > 0) { s.teardown -= dt; s.vx = s.vy = 0; return; }
  if (s.buffs.brace > 0 || (s.pinned && s.order !== 'retreat')) { s.vx = s.vy = 0; return; }
  if (s.repathT > 0) s.repathT -= dt;
  let wx = s.tx, wy = s.ty;
  if (s.path && s.path.length) { wx = s.path[0].x; wy = s.path[0].y; }
  const dx = wx - s.x, dy = wy - s.y, d = Math.sqrt(dx * dx + dy * dy);
  const sp = speedOf(state, s);
  if (d < Math.max(4, sp * dt)) {
    if (s.path && s.path.length) { s.x = wx; s.y = wy; s.path.shift(); if (s.path.length) return; }
    s.vx = 0; s.vy = 0;
    if (dist(s.x, s.y, s.tx, s.ty) > 8) { s.path = null; s.x = s.tx; s.y = s.ty; }
    if (s.order === 'move' || s.order === 'attackMove') s.order = 'idle';
    if (s.faceTo != null) { s.facing = s.faceTo; s.faceTo = null; }
    if (s.order === 'retreat') { s.order = 'idle'; s.morale = Math.max(s.morale, s.maxMorale * 0.5); if (s.morale >= s.maxMorale * 0.6) s.broken = false; }
    return;
  }
  const nx = dx / d, ny = dy / d;
  const ox = s.x, oy = s.y;
  s.vx = nx * sp; s.vy = ny * sp;
  s.x = clamp(s.x + s.vx * dt, 10, state.map.width - 10);
  s.y = clamp(s.y + s.vy * dt, 10, state.map.height - 10);
  if (blockedAt(state, s.x, s.y, def.isVehicle) && !blockedAt(state, ox, oy, def.isVehicle)) {
    // slide along the blocker, else repath
    if (!blockedAt(state, s.x, oy, def.isVehicle)) s.y = oy;
    else if (!blockedAt(state, ox, s.y, def.isVehicle)) s.x = ox;
    else { s.x = ox; s.y = oy; s.repathT = 0; requestPath(state, s); }
  }
  s.facing = Math.atan2(ny, nx);
}

/* builders, garrisons, transports, reinforcements, buffs */
function updateSquadMisc(state, s, dt) {
  const def = UNIT_DEFS[s.unitType];
  for (const k in s.abilityCd) if (s.abilityCd[k] > 0) s.abilityCd[k] = Math.max(0, s.abilityCd[k] - dt);
  for (const k in s.buffs) if (s.buffs[k] > 0) s.buffs[k] = Math.max(0, s.buffs[k] - dt);
  if (s.flash > 0) s.flash -= dt;
  if (s.syncKillTimer > 0) s.syncKillTimer -= dt;
  if (s.revealT > 0) s.revealT -= dt;
  s.stealthed = def.infiltrate && s.revealT <= 0;
  if (def.isHero && state.players[s.playerId].heroGear.ultimate && s.hp < s.maxHp) { s.models[0].hp = Math.min(s.models[0].maxHp, s.models[0].hp + 7 * dt); recalcSquad(s); }
  // reinforcements trickle in one model at a time
  if (s.reinforcePending > 0) {
    const ok = !s.inside || findBuilding(state, s.inside);
    const nearOk = hasStructureNear(state, s.playerId, s.x, s.y, 320, ['hq', 'barracks', 'bastion']) || (state.time - s.lastHitT > 8 && state.map.relays.some((r) => r.owner === s.playerId && dist(r.x, r.y, s.x, s.y) < 420));
    if (ok && nearOk) {
      s.reinforceT -= dt;
      if (s.reinforceT <= 0) {
        const dead = s.models.find((m) => !m.alive);
        const p = state.players[s.playerId];
        if (dead) { dead.alive = true; dead.hp = dead.maxHp; dead.weapon = dead.leader ? def.weapon : (def.teamWeapon && s.models.indexOf(dead) === 0 ? def.teamWeapon : dead.weapon); dead.cd = 1; }
        s.reinforcePending--; recalcSquad(s);
        state.effects.push({ type: 'reinforce', x: s.x, y: s.y, t: 0.5, faction: s.playerId });
        s.reinforceT = s.reinforcePending > 0 ? def.reinforceTime : 0;
        if (s.modelCount >= s.maxModels) { p.aether += s.reinforcePending * def.reinforceCost; s.reinforcePending = 0; }
      }
    }
  }
  if (s.order === 'garrison') {
    const b = findBuilding(state, s.garrisonTarget);
    if (!b || b.occupant) { s.order = 'idle'; return; }
    if (dist(s.x, s.y, b.x, b.y) < BUILDING_DEFS[b.type].size * 0.62 + 45) {
      b.occupant = s.id; s.inside = b.id; s.order = 'idle'; s.path = null; s.x = b.x; s.y = b.y; s.setup = 0;
      pushEvent(state, { type: 'garrison', playerId: s.playerId, x: b.x, y: b.y });
    }
  } else if (s.order === 'load') {
    const t = findSquad(state, s.loadTarget);
    if (!t || t.cargo.length >= UNIT_DEFS[t.unitType].capacity) { s.order = 'idle'; return; }
    if (dist(s.x, s.y, t.x, t.y) < 75) { t.cargo.push(s.id); s.inside = t.id; s.order = 'idle'; s.path = null; s.setup = 0; }
    else if (dist(s.tx, s.ty, t.x, t.y) > 40) { s.repathT = 0; setDest(state, s, t.x, t.y); }
  } else if (def.isBuilder) {
    if (s.order === 'build') {
      const b = findBuilding(state, s.buildTarget);
      if (!b || b.complete) { s.order = 'idle'; s.buildTarget = null; }
    } else if (s.order === 'repair') {
      const t = findBuilding(state, s.repairTarget) || findSquad(state, s.repairTarget);
      const tmax = t ? t.maxHp : 0;
      if (!t || t.hp >= tmax - 0.5 || t.hp <= 0) { s.order = 'idle'; s.repairTarget = null; }
      else if (dist(s.x, s.y, t.x, t.y) < (t.type ? BUILDING_DEFS[t.type].size * 0.62 : 20) + 50) {
        const heal = 24 * dt * (s.modelCount / def.models);
        if (t.type) t.hp = Math.min(t.maxHp, t.hp + heal); else { t.models[0].hp = Math.min(t.models[0].maxHp, t.models[0].hp + heal); recalcSquad(t); }
        s.repairing = 0.3;
      } else if (!s.path || !s.path.length) setDest(state, s, t.x, t.y);
    } else if (s.order === 'idle') {
      s.repairScan = (s.repairScan || 0) - dt;
      if (s.repairScan <= 0) {
        s.repairScan = 1.0;
        let best = null, bd = 240;
        for (const b of state.buildings) if (b.playerId === s.playerId && b.complete && b.hp < b.maxHp * 0.98 && state.time - b.lastHitT > 3) { const d = dist(s.x, s.y, b.x, b.y); if (d < bd) { bd = d; best = b; } }
        for (const v of state.squads) if (v.playerId === s.playerId && UNIT_DEFS[v.unitType].isVehicle && v.hp < v.maxHp * 0.98) { const d = dist(s.x, s.y, v.x, v.y); if (d < bd) { bd = d; best = v; } }
        if (best) { s.order = 'repair'; s.repairTarget = best.id; }
      }
    }
  }
  if (s.repairing > 0) s.repairing -= dt;
}

/* ------------------------------ Capture ------------------------------ */
function updateCapture(state, dt) {
  for (const relay of state.map.relays) {
    const present = { vigilant: 0, riven: 0 };
    for (const s of state.squads) {
      const def = UNIT_DEFS[s.unitType];
      if (!def.canCapture || s.broken || s.order === 'retreat' || s.inside || s.jump) continue;
      if (dist(s.x, s.y, relay.x, relay.y) < 62) present[s.playerId] += def.captureRate * (s.modelCount / def.models);
    }
    const v = present.vigilant, r = present.riven;
    if (relay.owner && relay.captureAmount >= 1) for (const s of state.squads) if (s.order === 'capture' && s.captureRelay === relay.id && s.playerId === relay.owner) { s.order = 'idle'; s.captureRelay = null; }
    if ((v > 0 && r > 0) || (!v && !r)) continue;
    const pid = v > 0 ? 'vigilant' : 'riven', amt = v > 0 ? v : r;
    const rate = relay.relic ? 0.6 : 1;
    if (relay.owner === pid) { relay.captureAmount = Math.min(1, relay.captureAmount + dt * 0.5); continue; }
    if (relay.owner && relay.owner !== pid) {
      relay.captureAmount -= dt * 0.25 * amt * rate;
      if (relay.captureAmount <= 0) {
        const lost = relay.owner;
        relay.owner = null; relay.captureAmount = 0;
        pushEvent(state, { type: 'lost', relayId: relay.id, playerId: lost, x: relay.x, y: relay.y, relic: !!relay.relic });
        if (relay.bastionId) { const b = findBuilding(state, relay.bastionId); if (b) destroyBuilding(state, b); }
      }
    } else {
      if (relay.capturingFaction !== pid) { relay.capturingFaction = pid; relay.captureAmount = 0; }
      relay.captureAmount += dt * 0.35 * amt * rate;
      if (relay.captureAmount >= 1) {
        relay.owner = pid; relay.captureAmount = 1;
        pushEvent(state, { type: 'capture', relayId: relay.id, playerId: pid, x: relay.x, y: relay.y, relic: !!relay.relic });
      }
    }
  }
}

/* ------------------------------ Economy & victory ------------------------------ */
function incomeOf(state, pid) {
  let aether = 0, flux = 0;
  for (const relay of state.map.relays) if (relay.owner === pid) {
    let rate = relay.aetherRate;
    if (relay.bastionId) { const b = findBuilding(state, relay.bastionId); if (b && b.complete) rate *= 1.35; }
    aether += rate;
  }
  aether *= upkeepMult(state, pid);
  for (const b of state.buildings) if (b.playerId === pid && b.complete) { flux += BUILDING_DEFS[b.type].generatesFlux || 0; if (b.type === 'hq') aether += GATHER.hqAether; }
  const p = state.players[pid];
  if (p.isAI && p.difficulty === 'hard') { aether *= 1.1; flux *= 1.1; }
  return { aether, flux };
}
function updateEconomy(state, dt) {
  for (const pid of Object.keys(state.players)) {
    const p = state.players[pid], inc = incomeOf(state, pid);
    p.aether += inc.aether * dt; p.flux += inc.flux * dt;
  }
  if (state.controlVictoryEnabled && !state.winner) {
    const crit = state.map.relays.filter((r) => r.critical);
    const v = crit.filter((r) => r.owner === 'vigilant').length, r = crit.filter((q) => q.owner === 'riven').length;
    if (v > r) state.players.riven.tickets -= dt * (0.6 + (v - r - 1) * 0.5);
    if (r > v) state.players.vigilant.tickets -= dt * (0.6 + (r - v - 1) * 0.5);
    if (state.players.vigilant.tickets <= 0) { state.winner = 'riven'; state.winReason = 'control'; }
    else if (state.players.riven.tickets <= 0) { state.winner = 'vigilant'; state.winReason = 'control'; }
  }
}

/* ------------------------------ Buildings ------------------------------ */
function updateBuildings(state, dt) {
  for (const b of state.buildings.slice()) {
    const def = BUILDING_DEFS[b.type];
    if (b.flash > 0) b.flash -= dt;
    if (!b.playerId) continue;
    if (!b.complete) {
      let crews = 0;
      for (const s of state.squads) if (s.playerId === b.playerId && s.order === 'build' && s.buildTarget === b.id && dist(s.x, s.y, b.x, b.y) < def.size * 0.62 + 55) crews += s.modelCount / UNIT_DEFS[s.unitType].models;
      if (crews > 0) {
        const rate = (1 + 0.5 * (crews - 1)) / Math.max(0.1, def.buildTime);
        b.buildProgress = Math.min(1, b.buildProgress + dt * rate);
        b.hp = Math.min(b.maxHp, b.hp + dt * rate * def.hp);
        b.building = 0.3;
      }
      if (b.building > 0) b.building -= dt;
      if (b.buildProgress >= 1) {
        b.complete = true; b.buildProgress = 1; b.hp = Math.max(b.hp, def.hp * 0.5);
        rebuildGrids(state);
        state.players[b.playerId].stats.built++;
        pushEvent(state, { type: 'built', playerId: b.playerId, buildingType: b.type, x: b.x, y: b.y });
      }
      continue;
    }
    if (b.queue.length > 0) {
      const job = b.queue[0];
      job.remaining -= dt;
      if (job.remaining <= 0) {
        b.queue.shift();
        const p = state.players[b.playerId];
        if (job.kind === 'unit') {
          const rp = b.rally || { x: b.x + (b.playerId === 'vigilant' ? 1 : -1) * (def.size + 60), y: b.y + 20 };
          const a = Math.atan2(rp.y - b.y, rp.x - b.x), r = def.size * 0.62 + 30;
          const s = spawnSquad(state, b.playerId, job.unitType, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
          s.producedFrom = b.id;
          if (b.rally || !UNIT_DEFS[job.unitType].civil) { s.tx = rp.x; s.ty = rp.y; s.order = 'move'; requestPath(state, s); }
          pushEvent(state, { type: 'unitReady', playerId: b.playerId, unitType: job.unitType, squadId: s.id, x: s.x, y: s.y });
        } else if (job.kind === 'research') applyResearch(state, p, job.id);
        else if (job.kind === 'tier') applyTier(state, p, job.tier);
      }
    }
    if (def.turretWeapon) {
      b.turretCd = Math.max(0, b.turretCd - dt);
      if (b.turretCd <= 0) {
        const w = WEAPONS[def.turretWeapon];
        let best = null, bd = w.range;
        for (const e of state.squads) {
          if (e.playerId === b.playerId || e.modelCount === 0 || (e.inside && !findBuilding(state, e.inside)) || !isVisibleTo(state, b.playerId, e)) continue;
          const d = dist(b.x, b.y, e.x, e.y); if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          state.projectiles.push({ id: nid('p'), x: b.x, y: b.y, tx: best.x, ty: best.y, speed: 700, damage: w.damage, wtype: w.type, weapon: def.turretWeapon,
            splash: 0, suppress: 2, ownerId: b.playerId, from: b.id, faction: b.playerId, fx: 'tracer', targetSquadId: best.id, targetBuildingId: null, life: 1, turret: true });
          b.turretCd = w.cooldown; b.shots++;
        }
      }
    }
  }
}

/* ------------------------------ Projectiles & delayed blasts ------------------------------ */
function updateProjectiles(state, dt) {
  const remain = [];
  for (const p of state.projectiles) {
    if (p.arc) {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.h = Math.sin(k * Math.PI) * 60;
      if (k >= 1) {
        const from = findSquad(state, p.from);
        applySplash(state, p.tx, p.ty, p.splash, p.damage, p.wtype, p.ownerId, from);
        state.effects.push({ type: p.wtype === 'flame' ? 'fireblast' : 'explosion', x: p.tx, y: p.ty, t: 0.7, r: p.splash });
      } else remain.push(p);
      continue;
    }
    const d = dist(p.x, p.y, p.tx, p.ty), step = p.speed * dt;
    if (d <= step || p.life <= 0) {
      const from = findSquad(state, p.from);
      if (p.splash) {
        applySplash(state, p.tx, p.ty, p.splash, p.damage, p.wtype, p.ownerId, from, { suppress: p.suppress, weapon: p.weapon });
        if (p.fx === 'shell' || p.fx === 'beam') state.effects.push({ type: 'explosion', x: p.tx, y: p.ty, t: 0.5, r: p.splash });
      } else if (p.targetSquadId) {
        const s = findSquad(state, p.targetSquadId);
        if (s && dist(s.x, s.y, p.tx, p.ty) < 70) dealDamageToSquad(state, s, p.damage, p.wtype, from, false, { suppress: p.suppress, ignoresCover: p.ignoresCover, weapon: p.weapon });
      } else if (p.targetBuildingId) {
        const b = findBuilding(state, p.targetBuildingId);
        if (b) dealDamageToBuilding(state, b, p.damage, p.wtype);
      }
      state.effects.push({ type: 'impact', x: p.tx, y: p.ty, t: 0.2, faction: p.faction, fx: p.fx });
    } else {
      p.x += (p.tx - p.x) / d * step; p.y += (p.ty - p.y) / d * step; p.life -= dt;
      remain.push(p);
    }
  }
  state.projectiles = remain;
}
function updatePending(state, dt) {
  const keep = [];
  for (const e of state.pending) {
    e.t -= dt;
    if (e.t > 0) { keep.push(e); continue; }
    if (e.kind === 'blast') {
      applySplash(state, e.x, e.y, e.r, e.damage, e.wtype, e.owner, findSquad(state, e.from));
      state.effects.push({ type: 'explosion', x: e.x, y: e.y, t: 1, r: e.r, big: true, fx: e.fx });
    }
  }
  state.pending = keep;
}
function updateEffects(state, dt) {
  state.effects = state.effects.filter((e) => (e.t -= dt) > 0);
}
function updateHeroes(state) {
  for (const pid of Object.keys(state.players)) {
    const p = state.players[pid];
    if (p.heroDeadAt == null || state.time - p.heroDeadAt < HERO_RESPAWN) continue;
    const hq = findBuilding(state, p.hqId); if (!hq) continue;
    const s = spawnSquad(state, pid, unitTypeFor(pid, 'hero'), hq.x + (pid === 'vigilant' ? 1 : -1) * 90, hq.y + 30);
    applyHeroGear(s, p);
    p.heroDeadAt = null;
    pushEvent(state, { type: 'heroUp', playerId: pid, x: s.x, y: s.y, squadId: s.id });
  }
}
function heroRespawnIn(state, pid) { const p = state.players[pid]; return p.heroDeadAt == null ? 0 : Math.max(0, HERO_RESPAWN - (state.time - p.heroDeadAt)); }
/* ------------------------------ Gathering ------------------------------
 * Workers walk to a finite node (Aether crystal or salvage wreck), work it for a few
 * seconds, then haul the load to the nearest drop-off (Command Nexus or Siphon).
 * Income from gathering therefore scales with how close a drop-off is to the field. */
function findNode(state, id) { for (const n of state.nodes) if (n.id === id) return n; return null; }
function isDropOff(b) { return b.complete && b.hp > 0 && (b.type === 'hq' || BUILDING_DEFS[b.type].dropOff); }
function nearestDrop(state, pid, x, y) {
  let best = null, bd = 1e9;
  for (const b of state.buildings) if (b.playerId === pid && isDropOff(b)) { const d = dist(x, y, b.x, b.y); if (d < bd) { bd = d; best = b; } }
  return best;
}
function dropRadius(b) { return BUILDING_DEFS[b.type].size * 0.62 + 26; }
function nodeDanger(state, pid, n) {
  for (const s of state.squads) if (s.playerId !== pid && !UNIT_DEFS[s.unitType].civil && !s.inside && dist(s.x, s.y, n.x, n.y) < 260 && isVisibleTo(state, pid, s)) return true;
  return false;
}
function nodeClaims(state, n, except) {
  let c = 0;
  for (const s of state.squads) if (s !== except && s.order === 'gather' && s.gatherNode === n.id) c++;
  return c;
}
// Score candidate nodes: travel to node + haul distance to the nearest drop-off + crowding/danger penalties.
function pickNode(state, s, opts) {
  opts = opts || {};
  let best = null, bs = 1e9;
  for (const n of state.nodes) {
    if (n.amount <= 0) continue;
    if (opts.kind && n.kind !== opts.kind) continue;
    if (opts.fieldId && n.fieldId !== opts.fieldId) continue;
    const dn = dist(s.x, s.y, n.x, n.y);
    if (opts.maxD && dn > opts.maxD) continue;
    const drop = nearestDrop(state, s.playerId, n.x, n.y);
    if (!drop) continue;
    const haul = dist(n.x, n.y, drop.x, drop.y);
    if (!opts.any && haul > 700) continue;
    let score = dn * 0.6 + haul * 1.2 + nodeClaims(state, n, s) * 90 + (n.kind === 'salvage' ? 40 : 0);
    if (nodeDanger(state, s.playerId, n)) score += 900;
    if (score < bs) { bs = score; best = n; }
  }
  return best;
}
function autoGather(state, s, opts) {
  if (!s || !UNIT_DEFS[s.unitType].isWorker) return false;
  const n = pickNode(state, s, opts);
  if (!n) return false;
  startGather(state, s, n);
  return true;
}
function startGather(state, s, n) {
  s.order = 'gather'; s.gatherNode = n.id; s.gatherField = n.fieldId || null; s.gatherKind = n.kind;
  s.targetId = null; s.buildTarget = null;
  if (s.carry && s.carry.amt > 0) { s.gPhase = 'toDrop'; const d = nearestDrop(state, s.playerId, s.x, s.y); if (d) { s.repathT = 0; setDest(state, s, d.x, d.y); } }
  else { s.gPhase = 'toNode'; s.repathT = 0; setDest(state, s, n.x, n.y); }
}
function issueGather(state, pid, squadIds, nodeId) {
  const n = findNode(state, nodeId);
  if (!n) return { ok: false, reason: 'no node' };
  let k = 0;
  for (const id of squadIds) {
    const s = findSquad(state, id);
    if (!s || s.playerId !== pid || !UNIT_DEFS[s.unitType].isWorker || s.inside) continue;
    startGather(state, s, n); k++;
  }
  return k ? { ok: true, count: k } : { ok: false, reason: 'no workers' };
}
function removeNode(state, n, pid) {
  const i = state.nodes.indexOf(n);
  if (i >= 0) state.nodes.splice(i, 1);
  pushEvent(state, { type: 'depleted', kind: n.kind, fieldId: n.fieldId || null, playerId: pid || null, x: n.x, y: n.y });
}
function retarget(state, s) {
  // stay on the same field if it has anything left, else the best node nearby, else go idle
  const n = (s.gatherField && pickNode(state, s, { fieldId: s.gatherField })) || pickNode(state, s, { kind: s.gatherKind, maxD: 900 }) || pickNode(state, s, { maxD: 900 });
  if (n) { const carry = s.carry; startGather(state, s, n); if (!carry) s.gPhase = 'toNode'; return true; }
  if (s.carry && s.carry.amt > 0) { s.gPhase = 'toDrop'; s.gatherNode = null; return true; }
  s.order = 'idle'; s.gatherNode = null; s.gPhase = null;
  return false;
}
function depositRate(state, pid) {
  const p = state.players[pid];
  const win = Math.min(30, Math.max(5, state.time));
  let a = 0, f = 0;
  for (const d of p.deposits) if (state.time - d.t <= win) { a += d.a; f += d.f; }
  return { aether: a / win, flux: f / win };
}
function updateGather(state, s, dt) {
  const def = UNIT_DEFS[s.unitType];
  if (!def.isWorker) return;
  if (s.mining > 0) s.mining -= dt;
  if (s.order !== 'gather') {
    if (s.gNodeHeld) { const n = findNode(state, s.gNodeHeld); if (n && n.miner === s.id) n.miner = null; s.gNodeHeld = null; }
    if (s.order === 'idle' && !s.inside && !s.broken) {
      s.gScan = (s.gScan || 0) - dt;
      if (s.gScan <= 0) { s.gScan = 2; autoGather(state, s, { maxD: 700 }); }
    }
    return;
  }
  if (s.inside || s.broken) return;
  if (s.gPhase === 'toDrop') {
    const drop = nearestDrop(state, s.playerId, s.x, s.y);
    if (!drop) return; // nowhere to unload; wait
    if (dist(s.x, s.y, drop.x, drop.y) < dropRadius(drop)) {
      const p = state.players[s.playerId], c = s.carry;
      if (c && c.amt > 0) {
        const mult = p.isAI && p.difficulty === 'hard' ? 1.1 : 1;
        const amt = c.amt * mult;
        if (c.kind === 'salvage') { p.flux += amt; p.stats.salvaged += amt; p.deposits.push({ t: state.time, a: 0, f: amt }); }
        else { p.aether += amt; p.stats.gathered += amt; p.deposits.push({ t: state.time, a: amt, f: 0 }); }
        while (p.deposits.length && state.time - p.deposits[0].t > 30) p.deposits.shift();
        pushEvent(state, { type: 'deposit', playerId: s.playerId, kind: c.kind, amount: amt, x: drop.x, y: drop.y });
      }
      s.carry = null; s.gPhase = 'toNode';
      const n = findNode(state, s.gatherNode);
      if (!n || n.amount <= 0) { retarget(state, s); return; }
      s.repathT = 0; setDest(state, s, n.x, n.y);
    } else if (!s.path || !s.path.length || dist(s.tx, s.ty, drop.x, drop.y) > 30) setDest(state, s, drop.x, drop.y);
    return;
  }
  const n = findNode(state, s.gatherNode);
  if (!n || n.amount <= 0) { retarget(state, s); return; }
  if (s.gPhase === 'mining') {
    if (n.miner !== s.id) { s.gPhase = 'toNode'; return; }
    s.gT -= dt; s.mining = 0.25; s.faceTo = { x: n.x, y: n.y };
    if (s.gT <= 0) {
      const cap = n.kind === 'salvage' ? GATHER.carryFlux : GATHER.carryAether;
      const amt = Math.min(cap, n.amount);
      n.amount -= amt; n.miner = null; s.gNodeHeld = null;
      s.carry = { kind: n.kind, amt };
      if (n.amount <= 0.001) removeNode(state, n, s.playerId);
      s.gPhase = 'toDrop';
      const drop = nearestDrop(state, s.playerId, s.x, s.y);
      if (drop) { s.repathT = 0; setDest(state, s, drop.x, drop.y); }
    }
    return;
  }
  // toNode
  if (dist(s.x, s.y, n.x, n.y) < 24) {
    const holder = n.miner && findSquad(state, n.miner);
    if (holder && holder !== s && holder.order === 'gather' && holder.gPhase === 'mining' && holder.gatherNode === n.id) {
      // someone is already working this node; hop to a free one in the same field if there is one
      let alt = null, ad = 140;
      for (const m of state.nodes) if (m !== n && m.amount > 0 && m.kind === n.kind && (!m.miner || !findSquad(state, m.miner)) && (n.fieldId ? m.fieldId === n.fieldId : true)) { const d = dist(s.x, s.y, m.x, m.y); if (d < ad) { ad = d; alt = m; } }
      if (alt) { s.gatherNode = alt.id; s.repathT = 0; setDest(state, s, alt.x, alt.y); }
      return; // otherwise wait in line
    }
    n.miner = s.id; s.gNodeHeld = n.id; s.gPhase = 'mining';
    s.gT = n.kind === 'salvage' ? GATHER.salvageTime : GATHER.mineTime;
    s.path = null; s.tx = s.x; s.ty = s.y;
  } else if (!s.path || !s.path.length || dist(s.tx, s.ty, n.x, n.y) > 20) setDest(state, s, n.x, n.y);
}
function upkeepMult(state, pid) {
  const pop = popUsed(state, pid).squad;
  return Math.max(GATHER.upkeepMin, 1 - GATHER.upkeepPerPop * Math.max(0, pop - GATHER.upkeepFree));
}
function salvageFromVehicle(state, s, def) {
  const amt = Math.round(30 + def.costFlux * 0.5 + def.costAether * 0.15);
  state.nodes.push({ id: nid('n'), kind: 'salvage', x: s.x, y: s.y, amount: amt, max: amt, miner: null, model: s.unitType, scale: def.isSuper ? 1.6 : 1, facing: s.facing });
  pushEvent(state, { type: 'wreck', x: s.x, y: s.y, unitType: s.unitType });
}
function workerCount(state, pid) {
  let n = 0;
  for (const s of state.squads) if (s.playerId === pid && UNIT_DEFS[s.unitType].isWorker) n++;
  for (const b of state.buildings) if (b.playerId === pid) for (const j of b.queue) if (j.kind === 'unit' && UNIT_DEFS[j.unitType].isWorker) n++;
  return n;
}
/* ------------------------------ AI ------------------------------ */
function updateAI(state, dt) {
  for (const pid of Object.keys(state.players)) {
    const ai = state.players[pid];
    if (ai.isAI && !state.winner) updateAIPlayer(state, ai, dt);
  }
}
function squadStrength(s) {
  const def = UNIT_DEFS[s.unitType];
  return s.hp * (def.isVehicle ? 1.4 : def.isHero ? 1.2 : 1) * (s.broken ? 0.3 : 1);
}
function aiFindSpot(state, pid, type, hq) {
  const dir = pid === 'vigilant' ? -1 : 1; // build behind the HQ first
  for (let ring = 0; ring < 5; ring++) {
    const r = 150 + ring * 55;
    for (let k = 0; k < 12; k++) {
      const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.42 + (dir < 0 ? Math.PI : 0) + (state.rng() - 0.5) * 0.3;
      const x = hq.x + Math.cos(a) * r, y = hq.y + Math.sin(a) * r;
      if (placementCheck(state, pid, type, x, y).ok) return { x, y };
    }
  }
  return null;
}
function aiBuild(state, ai, type, hq) {
  if (state.buildings.some((b) => b.playerId === ai.id && !b.complete && b.type !== 'bastion' && b.type === type)) return false;
  const spot = aiFindSpot(state, ai.id, type, hq);
  if (!spot) return false;
  return placeBuilding(state, ai.id, type, spot.x, spot.y).ok;
}
// Put a Siphon next to a crystal field that is still rich, far from our drop-offs and not contested.
function aiRefinery(state, ai, hq) {
  const pid = ai.id, eh = state.map.hqSpawns[enemyOf(pid)];
  if (state.buildings.some((b) => b.playerId === pid && b.type === 'refinery' && !b.complete)) return false;
  const fields = {};
  for (const n of state.nodes) if (n.kind === 'aether') { const f = fields[n.fieldId] || (fields[n.fieldId] = { x: 0, y: 0, k: 0, amt: 0 }); f.x += n.x; f.y += n.y; f.k++; f.amt += n.amount; }
  let best = null, bs = 1e9;
  for (const id in fields) {
    const f = fields[id]; f.x /= f.k; f.y /= f.k;
    if (f.amt < 700) continue;
    const drop = nearestDrop(state, pid, f.x, f.y);
    if (drop && dist(drop.x, drop.y, f.x, f.y) < 170) continue;
    const dMe = dist(f.x, f.y, hq.x, hq.y), dEn = dist(f.x, f.y, eh.x, eh.y);
    if (dEn < dMe * 0.9) continue; // enemy side of the map
    if (nodeDanger(state, pid, f)) continue;
    const score = dMe - f.amt * 0.05;
    if (score < bs) { bs = score; best = f; }
  }
  if (!best) return false;
  const a0 = Math.atan2(hq.y - best.y, hq.x - best.x);
  for (const r of [95, 120, 145]) for (let k = 0; k < 9; k++) {
    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
    const x = best.x + Math.cos(a) * r, y = best.y + Math.sin(a) * r;
    if (placementCheck(state, pid, 'refinery', x, y).ok) return placeBuilding(state, pid, 'refinery', x, y).ok;
  }
  return false;
}
function updateAIPlayer(state, ai, dt) {
  const st = ai.aiState;
  st.timer += dt;
  const hq = findBuilding(state, ai.hqId);
  if (!hq) return;
  const diff = ai.difficulty, pid = ai.id, eid = enemyOf(pid);
  const macroEvery = diff === 'easy' ? 5 : diff === 'hard' ? 2 : 3;
  const armyEvery = diff === 'easy' ? 2 : diff === 'hard' ? 0.5 : 1;
  if (st.timer - st.lastMacro >= macroEvery) { st.lastMacro = st.timer; aiMacro(state, ai, hq); }
  if (st.timer - st.lastArmy >= armyEvery) { st.lastArmy = st.timer; aiArmy(state, ai, hq); }
}
function aiMacro(state, ai, hq) {
  const pid = ai.id, diff = ai.difficulty, t = state.time;
  const myB = state.buildings.filter((b) => b.playerId === pid);
  const done = (type) => myB.filter((b) => b.type === type && b.complete);
  const has = (type) => myB.some((b) => b.type === type);
  const mySq = state.squads.filter((s) => s.playerId === pid);
  const builders = mySq.filter((s) => UNIT_DEFS[s.unitType].isBuilder);
  const freeBuilder = builders.some((s) => s.order !== 'build');
  const vis = state.visible[pid] || new Set();
  const enemies = state.squads.filter((s) => s.playerId !== pid && vis.has(s.id));
  const eVeh = enemies.filter((s) => UNIT_DEFS[s.unitType].isVehicle).length;
  ai.aiState.seenVeh = Math.max(eVeh, (ai.aiState.seenVeh || 0) * 0.97);
  const eInf = enemies.filter((s) => !UNIT_DEFS[s.unitType].isVehicle).length;
  const t2At = diff === 'hard' ? 130 : diff === 'easy' ? 260 : 170;
  let reserve = 60;
  const armyN = mySq.filter((s) => !UNIT_DEFS[s.unitType].civil && !UNIT_DEFS[s.unitType].isHero).length;
  const relN = state.map.relays.filter((r) => r.owner === pid).length;
  const stable = armyN >= 4 && relN >= 2;
  if (stable && ai.tier === 1 && t > t2At - 40) reserve = 330;
  if (stable && ai.tier === 2 && t > t2At + 220 && done('armory').length) reserve = 480;
  if (hq.queue.some((j) => j.kind === 'tier')) reserve = 60;
  // builders
  const wantB = diff === 'hard' ? 3 : 2;
  if (builders.length < wantB && !hq.queue.some((j) => j.unitType && UNIT_DEFS[j.unitType].isBuilder)) queueUnit(state, hq.id, unitTypeFor(pid, 'builder'));
  // workers & gathering
  const workers = mySq.filter((s) => UNIT_DEFS[s.unitType].isWorker);
  const wantW = Math.min(GATHER.workerCap, (diff === 'easy' ? 4 : diff === 'hard' ? 8 : 6) + (ai.tier >= 2 ? 2 : 0));
  const wType = unitTypeFor(pid, 'worker');
  if (workers.length < wantW && !hq.queue.some((j) => j.unitType === wType) && ai.aether > UNIT_DEFS[wType].costAether + (workers.length < 4 ? 0 : Math.min(reserve, 120)) && !unitAvailability(state, pid, wType)) queueUnit(state, hq.id, wType);
  for (const w of workers) if (w.order === 'idle' && !w.inside) autoGather(state, w, { any: true });
  // tiers
  if (ai.tier === 1 && t > t2At && ai.aether > 330 && (stable || ai.aether > 600)) researchTier(state, pid, 2);
  if (ai.tier === 2 && t > t2At + 260 && ai.aether > 480 && done('armory').length && (stable || ai.aether > 800)) researchTier(state, pid, 3);
  // construction
  if (freeBuilder) {
    const gens = myB.filter((b) => b.type === 'generator').length;
    const wantGen = t < 50 ? 1 : t < 260 ? 2 : 3;
    if (gens < wantGen && ai.aether > 110 + (reserve > 100 ? reserve : 0)) aiBuild(state, ai, 'generator', hq);
    else if (t > 45 && ai.aether > 150 + (reserve > 100 ? reserve * 0.5 : 0) && myB.filter((b) => b.type === 'refinery').length < (diff === 'easy' ? 1 : diff === 'hard' ? 3 : 2) && aiRefinery(state, ai, hq)) { /* expanding */ }
    else if (ai.tier >= 2 && !has('armory') && ai.aether > 220) aiBuild(state, ai, 'armory', hq);
    else if (ai.tier >= 2 && !has('vehicleBay') && t > 320 && ai.aether > 280) aiBuild(state, ai, 'vehicleBay', hq);
    else if (myB.filter((b) => b.type === 'barracks').length < (diff === 'easy' ? 1 : 2) && t > 240 && ai.aether > 260) aiBuild(state, ai, 'barracks', hq);
    else if (ai.aether > 220 + (reserve > 100 ? reserve : 0) && state.rng() < (diff === 'easy' ? 0.15 : 0.4)) {
      const relay = state.map.relays.find((r) => r.owner === pid && !r.relic && !r.bastionId && dist(r.x, r.y, hq.x, hq.y) < 1300);
      if (relay) placeBuilding(state, pid, 'bastion', relay.x, relay.y);
    }
  }
  ai.aiState.saving = reserve > 100 ? reserve : 0;
  // research
  if (reserve < 100 && (diff !== 'easy' || state.rng() < 0.3)) {
    const pop = popUsed(state, pid);
    const order = [];
    if (t > 80) order.push('r_grenades');
    if (pop.squad >= ai.squadCap - 4) order.push('r_cap');
    if (ai.tier >= 2) order.push('r_morale', 'r_hp');
    if (ai.tier >= 2 && diff !== 'easy') order.push('r_sight');
    if (pop.vehicle >= ai.vehicleCap - 1) order.push('r_vcap');
    for (const rid of order) {
      if (ai.aether < RESEARCH[rid].aether + reserve) break;
      const b = done(RESEARCH[rid].building).find((x) => x.queue.length < 2);
      if (b && !researchAvailability(state, pid, rid, b)) { queueResearch(state, b.id, rid); break; }
    }
  }
  // commander wargear
  const hero = mySq.find((s) => UNIT_DEFS[s.unitType].isHero);
  if (hero && diff !== 'easy') {
    if (!ai.heroGear.weapon && ai.tier >= 2 && ai.aether > 320) buyHeroGear(state, hero.id, 'weapon');
    else if (!ai.heroGear.ultimate && ai.tier >= 3 && ai.aether > 480) buyHeroGear(state, hero.id, 'ultimate');
  }
  // production
  const qMax = diff === 'hard' ? 2 : 1;
  const count = (role) => mySq.filter((s) => s.unitType === unitTypeFor(pid, role)).length + myB.reduce((a, b) => a + b.queue.filter((j) => j.unitType === unitTypeFor(pid, role)).length, 0);
  const core = pid === 'vigilant' ? 'scout' : 'pack';
  const heavy = pid === 'vigilant' ? 'heavy' : 'brute';
  const big = pid === 'vigilant' ? 'tank' : 'beast';
  for (const b of done('barracks')) {
    if (b.queue.length >= qMax) continue;
    let pick = core;
    if (count('mg') < (t > 300 ? 2 : 1) && t > 40) pick = 'mg';
    else if (diff !== 'easy' && count('sniper') < 1 && t > 110) pick = 'sniper';
    if (ai.aether > UNIT_DEFS[unitTypeFor(pid, pick)].costAether + reserve) queueUnit(state, b.id, unitTypeFor(pid, pick));
  }
  for (const b of done('armory')) {
    if (b.queue.length >= qMax) continue;
    const pick = state.rng() < 0.55 ? heavy : 'jump';
    if (ai.aether > 260) queueUnit(state, b.id, unitTypeFor(pid, pick));
  }
  for (const b of done('vehicleBay')) {
    if (b.queue.length >= 1) continue;
    const sup = unitTypeFor(pid, 'super');
    if (!unitAvailability(state, pid, sup)) queueUnit(state, b.id, sup);
    else if (ai.tier >= 3 && ai.aether > 460 && ai.flux > 130) queueUnit(state, b.id, unitTypeFor(pid, big));
  }
  // wargear: counters to what we see
  if (diff !== 'easy' && ai.aether > 200) {
    for (const s of mySq) {
      const def = UNIT_DEFS[s.unitType];
      if (!def.wargear.length || state.time - s.lastHitT < 5) continue;
      const anti = def.wargear.find((w) => (WEAPONS[w.id].type === 'lance' || WEAPONS[w.id].type === 'powerMelee') && w.tier <= ai.tier);
      const flame = def.wargear.find((w) => WEAPONS[w.id].type === 'flame' || w.id === 'v_storm');
      const pick = ai.aiState.seenVeh >= 0.8 && anti ? anti : (eInf >= 2 || state.rng() < 0.3) ? flame : null;
      if (pick && addWargear(state, s.id, pick.id).ok) break;
    }
  }
  if (diff !== 'easy' && ai.aether > 300 && state.rng() < 0.25) {
    const c = mySq.find((s) => { const d = UNIT_DEFS[s.unitType]; return !s.leaderAttached && !d.isHero && !d.isVehicle && !d.civil && !d.teamWeapon && !d.infiltrate; });
    if (c) upgradeSquad(state, c.id);
  }
}
function aiArmy(state, ai, hq) {
  const pid = ai.id, diff = ai.difficulty, st = ai.aiState, t = state.time;
  if (state.tutorial && t < 150) return;
  const vis = state.visible[pid] || new Set();
  const mine = state.squads.filter((s) => s.playerId === pid && !UNIT_DEFS[s.unitType].civil && !(s.inside && !findBuilding(state, s.inside)));
  const enemies = state.squads.filter((s) => s.playerId !== pid && vis.has(s.id) && !(s.inside && !findBuilding(state, s.inside)));
  const micro = diff !== 'easy';
  for (const s of mine) {
    const def = UNIT_DEFS[s.unitType];
    if (def.teamWeapon || def.infiltrate) s.stance = 'holdGround';
    if (s.jump) continue;
    // retreat micro
    const hurt = def.isHero ? s.hp < s.maxHp * 0.25 : def.isVehicle ? s.hp < s.maxHp * 0.2 : (s.modelCount <= Math.max(1, Math.floor(s.maxModels * 0.35)) || s.hp < s.maxHp * 0.28);
    if (micro && hurt && s.order !== 'retreat' && t - s.lastHitT < 3 && !def.isVehicle) { issueRetreat(state, [s.id]); s.aiReturn = true; continue; }
    // reinforce
    if (!def.isHero && !def.isVehicle && s.modelCount + s.reinforcePending < s.maxModels && ai.aether > def.reinforceCost + 40 + (ai.aiState.saving || 0) * 0.5 && (micro || s.order === 'idle')) reinforceSquad(state, s.id);
    if (s.order === 'retreat') continue;
    if (s.aiReturn && (s.modelCount + s.reinforcePending < s.maxModels || s.morale < s.maxMorale * 0.6) && !def.isHero) continue;
    s.aiReturn = false;
    // abilities
    for (const aid of def.abilities) {
      if (abilityReady(state, s, aid)) continue;
      const a = ABILITIES[aid];
      const near = enemies.filter((e) => dist(e.x, e.y, s.x, s.y) < (a.range || a.radius || 220));
      if (!near.length) continue;
      if (diff === 'easy' && state.rng() < 0.6) continue;
      if (aid === 'frag' || aid === 'firebomb' || aid === 'ordnance') {
        const tgt = near.slice().sort((a2, b2) => ((b2.inside ? 4 : 0) + (UNIT_DEFS[b2.unitType].teamWeapon && b2.setup > 0.5 ? 3 : 0) + b2.modelCount) - ((a2.inside ? 4 : 0) + (UNIT_DEFS[a2.unitType].teamWeapon && a2.setup > 0.5 ? 3 : 0) + a2.modelCount))[0];
        if (tgt && (tgt.modelCount >= 3 || tgt.inside || aid === 'ordnance')) useAbility(state, s.id, aid, tgt.x, tgt.y);
      } else if (aid === 'leap') {
        const tgt = near.find((e) => { const d2 = UNIT_DEFS[e.unitType]; return d2.teamWeapon || d2.infiltrate || d2.role === 'ranged'; });
        if (tgt && dist(tgt.x, tgt.y, s.x, s.y) > 120) useAbility(state, s.id, aid, tgt.x, tgt.y);
      } else if (aid === 'rally') { if (mine.some((m) => (m.broken || m.suppression > 45) && dist(m.x, m.y, s.x, s.y) < a.radius)) useAbility(state, s.id, aid); }
      else if (aid === 'howl') { if (near.filter((e) => dist(e.x, e.y, s.x, s.y) < a.radius).length >= 2) useAbility(state, s.id, aid); }
      else if (aid === 'brace') { if (s.suppression > 40) useAbility(state, s.id, aid); }
      else if (aid === 'rampage' || aid === 'charge') { if (near.some((e) => dist(e.x, e.y, s.x, s.y) < 160)) useAbility(state, s.id, aid); }
    }
  }
  // ranged squads idling in the open step into nearby cover (normal+)
  if (micro) for (const s of mine) {
    const def = UNIT_DEFS[s.unitType];
    if (s.order !== 'idle' || s.inside || def.role === 'melee' || def.isVehicle || def.isHero || def.civil || s.setup > 0.5) continue;
    if (coverAt(state.map, s.x, s.y) === 'heavy' || coverAt(state.map, s.x, s.y) === 'light') continue;
    let best = null, bd = 170;
    for (const c of state.map.cover) {
      if (c.type === 'negative') continue;
      const d = dist(s.x, s.y, c.x, c.y) - (c.type === 'heavy' ? 40 : 0);
      if (d < bd && !state.squads.some((o) => o !== s && o.playerId === pid && dist(o.x, o.y, c.x, c.y) < c.r * 0.6)) { bd = d; best = c; }
    }
    if (best) { const a = Math.atan2(s.y - best.y, s.x - best.x); issueMove(state, [s.id], best.x + Math.cos(a) * best.r * 0.4, best.y + Math.sin(a) * best.r * 0.4, true); }
  }
  // objectives
  const army = mine.filter((s) => s.order !== 'retreat' && !s.aiReturn && !s.inside);
  const eHq = findBuilding(state, state.players[enemyOf(pid)].hqId);
  const myStr = army.reduce((a, s) => a + squadStrength(s), 0);
  const eStr = enemies.reduce((a, s) => a + squadStrength(s), 0);
  // defend: anything of ours under attack recently near home
  const threat = state.events.slice(-40).reverse().find((e) => e.type === 'underAttack' && e.playerId === pid && t - e.t < 8);
  const relays = state.map.relays.filter((r) => r.owner !== pid);
  let objective = null;
  if (threat && dist(threat.x, threat.y, hq.x, hq.y) < 700) objective = { x: threat.x, y: threat.y, kind: 'defend' };
  else if (eHq && t > 540 && (myStr > eStr * 1.8 + 600 || state.players[enemyOf(pid)].tickets < 120) && army.length >= 5) objective = { x: eHq.x, y: eHq.y, kind: 'hq' };
  else if (relays.length) {
    let best = null, bs = -1e9;
    for (const r of relays) {
      const near = enemies.filter((e) => dist(e.x, e.y, r.x, r.y) < 300).reduce((a, e) => a + squadStrength(e), 0);
      const sc = (r.critical ? 3 : 1.5) + (r.relic && ai.tier >= 2 ? 2 : 0) - dist(r.x, r.y, hq.x, hq.y) / 700 - near / 400 + (r.owner ? 0.5 : 0);
      if (sc > bs) { bs = sc; best = r; }
    }
    objective = { x: best.x, y: best.y, kind: 'relay', relayId: best.id };
  }
  st.objective = objective;
  if (!objective) return;
  // early game: spread capturers over distinct neutral relays
  const neutral = state.map.relays.filter((r) => !r.owner && !r.relic);
  if (t < 200 && neutral.length) {
    const taken = new Set();
    for (const s of army) {
      const def = UNIT_DEFS[s.unitType];
      if (!def.canCapture || def.isHero || s.order === 'capture' || s.order === 'attack') { if (s.captureRelay) taken.add(s.captureRelay); continue; }
      if (s.order !== 'idle') continue;
      const r = neutral.filter((q) => !taken.has(q.id)).sort((a, b) => dist(a.x, a.y, s.x, s.y) - dist(b.x, b.y, s.x, s.y))[0];
      if (r) { taken.add(r.id); issueCapture(state, [s.id], r.id); }
    }
    return;
  }
  // main army: gather then push together
  const idle = army.filter((s) => s.order === 'idle' || (s.order === 'attackMove' && st.objectiveKey !== objective.x + ',' + objective.y && state.rng() < 0.5));
  const key = objective.x + ',' + objective.y;
  const ready = objective.kind === 'defend' || army.length >= (diff === 'easy' ? 3 : 4) || myStr > eStr * 1.2;
  if (!ready) {
    const rally = { x: hq.x + (pid === 'vigilant' ? 260 : -260), y: hq.y };
    const lazy = idle.filter((s) => dist(s.x, s.y, rally.x, rally.y) > 160 && !s.inside);
    if (lazy.length) issueMove(state, lazy.map((s) => s.id), rally.x, rally.y, true);
    return;
  }
  st.objectiveKey = key;
  const go = idle.filter((s) => dist(s.x, s.y, objective.x, objective.y) > 90);
  // weapon teams prefer garrisons near the objective
  for (const s of go.slice()) {
    const def = UNIT_DEFS[s.unitType];
    if (diff === 'easy' || !(def.teamWeapon || def.role === 'ranged')) continue;
    const bk = state.buildings.find((b) => b.type === 'bunker' && !b.occupant && dist(b.x, b.y, objective.x, objective.y) < 380 && !state.squads.some((q) => q.garrisonTarget === b.id && q.order === 'garrison'));
    if (bk && state.rng() < 0.5) { issueGarrison(state, [s.id], bk.id); go.splice(go.indexOf(s), 1); }
  }
  const capturers = go.filter((s) => UNIT_DEFS[s.unitType].canCapture && objective.kind === 'relay');
  if (capturers.length && objective.relayId) issueCapture(state, [capturers[0].id], objective.relayId);
  const rest = go.filter((s) => !capturers.length || s !== capturers[0]);
  if (rest.length) issueMove(state, rest.map((s) => s.id), objective.x, objective.y, true);
}

/* ------------------------------ Step ------------------------------ */
function step(state, dt) {
  if (state.winner) return state;
  dt = Math.min(dt, 0.1);
  state.tick++; state.time += dt;
  updateAI(state, dt);
  updateEconomy(state, dt);
  updateBuildings(state, dt);
  updateVision(state);
  updateCapture(state, dt);
  for (const s of state.squads.slice()) {
    if (s.modelCount === 0) continue;
    updateSquadMisc(state, s, dt);
    updateGather(state, s, dt);
    updateMorale(state, s, dt);
    updateMovement(state, s, dt);
    if (state.squads.indexOf(s) >= 0) updateCombat(state, s, dt);
  }
  updateProjectiles(state, dt);
  updatePending(state, dt);
  updateEffects(state, dt);
  updateHeroes(state);
  for (const p of Object.values(state.players)) { p.aether = Math.min(p.aether, 5000); p.flux = Math.min(p.flux, 2000); }
  return state;
}
function runHeadless(opts) {
  const state = createGame({ ...opts, headless: true });
  const maxTime = opts.maxTime || 600;
  while (state.time < maxTime && !state.winner) step(state, DT);
  return { winner: state.winner, winReason: state.winReason, time: state.time, ticks: state.tick,
    vigilantTickets: state.players.vigilant.tickets, rivenTickets: state.players.riven.tickets, squads: state.squads.length, buildings: state.buildings.length };
}

const API = {
  TICK_RATE, DT, CELL, FOG_CELL, HERO_RESPAWN, FACTIONS, UNIT_DEFS, BUILDING_DEFS, TECH, WEAPONS, DAMAGE_TABLE, ABILITIES, RESEARCH, HERO_GEAR, MAPS,
  BASE_SQUAD_CAP, BASE_VEHICLE_CAP, UPGRADE_COST,
  mulberry32, dist, clamp, createMap, coverAt, coverDamageMult, damageMult, createGame, step, runHeadless,
  issueMove, issueAttack, issueRetreat, issueCapture, issueGarrison, issueLoad, unloadTransport, issueStop, setStance,
  queueUnit, queueResearch, cancelQueue, placeBuilding, placementCheck, researchTier, reinforceSquad, reinforceCheck, useAbility, abilityReady,
  upgradeSquad, addWargear, buyHeroGear, spawnSquad, spawnBuilding, findSquad, findBuilding, aliveModels, getPlayer, popUsed, unitAvailability, researchAvailability,
  dealDamageToSquad, dealDamageToBuilding, findPath, lineClear, losClear, blockedAt, isVisibleTo, computeFog, updateVision, rebuildGrids, heroRespawnIn,
  relicOwner, incomeOf, retreatPoint, engageRange, wargearCount, layoutFormation, assignBuild,
  GATHER, issueGather, autoGather, pickNode, findNode, nearestDrop, upkeepMult, depositRate, workerCount, isDropOff,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.EmberveilSim = API;
