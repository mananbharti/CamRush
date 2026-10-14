import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const registry = readFileSync(new URL('../src/games/index.js', import.meta.url), 'utf8');
const games = registry.match(/export const games = \[(.*?)\]/s)[1].split(',').map(x => x.trim());
import Orbit from '../src/games/orbit.js';
import Memory from '../src/games/memory.js';
import Maze from '../src/games/maze.js';
import Hoops from '../src/games/hoops.js';
const app = (W = 1280, H = 720) => ({ W, H, hud: {}, tracker: { drawVideo() {} }, snd: new Proxy({}, { get: () => () => {} }), finish(score, options) { this.result = { score, ...options }; } });
const input = (p = null, press = false, keys = []) => ({ primary: p, keys: new Set(keys), consume(k) { if (k === 'Space' && press) { press = false; return true; } return false; } });
assert.equal(games.length, 21); assert.equal(new Set(games).size, 21);
for (const size of [[1280,720],[390,844],[360,640]]) for (const Game of [Orbit,Memory,Maze,Hoops]) { const a = app(...size), g = new Game(a); for (let n = 0; n < 12000 && !g.over; n++) g.update(1/60, input()); assert(g.over, Game.meta.name + ' ends'); assert(Number.isFinite(g.score)); assert(g.area().s > 0); }
let a = app(), g = new Orbit(a); g.gates = [{ at: 0.01, open: 0 }]; g.next = 10; g.update(0.02,input()); assert.equal(g.score,100); assert.equal(g.lives,3); g.update(0.02,input(null,true)); assert.equal(g.lane,1);
a = app(); g = new Memory(a); g.phase = 'repeat'; g.sequence = [0,3,1]; g.index = 0; g.choose(0); g.choose(3); g.choose(1); assert.equal(g.phase,'between'); assert.equal(g.score,125); g.nextRound(); g.phase='repeat'; g.choose((g.sequence[0]+1)%4); assert(g.over);
a = app(); g = new Maze(a); g.move(9,0); assert(g.x < 2,'Cannot tunnel through wall');
// Find a connected route, then traverse it to verify the actual win condition.
const queue = [[1,1,[]]], seen = new Set(['1,1']); let route;
while(queue.length) { const [x,y,p] = queue.shift(); if(x===9 && y===9) {route=p;break;} for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {const key=`${x+dx},${y+dy}`;if(!seen.has(key)&&g.open(x+dx+0.5,y+dy+0.5)){seen.add(key);queue.push([x+dx,y+dy,[...p,[x+dx,y+dy]]]);}} }
assert(route,'Maze must be solvable'); g.x=1.5;g.y=1.5;for(const [x,y] of route)g.move(x+0.5-g.x,y+0.5-g.y);g.update(0.01,input());assert(g.over);assert(a.result.title==='Maze escaped!');
a=app();g=new Hoops(a);g.shoot();const first=g.ball;g.shoot();assert.equal(g.ball,first);assert.equal(g.shots,1);g.ball={x:0.82,y:g.hoop-0.01,vx:0,vy:1,scored:false};g.update(0.02,input());assert.equal(g.made,1);assert.equal(g.score,100);g.update(0.02,input());assert.equal(g.score,100,'No duplicate basket');
console.log('PASS: 21 unique games; 3 viewport sizes; bounded idle runs; input, score, loss, maze route, wall tunneling and hoop crossing tests.');
