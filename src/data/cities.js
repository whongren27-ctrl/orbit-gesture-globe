export const cities=[
 {name:'NEW YORK',lat:40.7128,lng:-74.006,tier:1},
 {name:'LONDON',lat:51.5074,lng:-0.1278,tier:1},
 {name:'TOKYO',lat:35.6762,lng:139.6503,tier:1},
 {name:'SINGAPORE',lat:1.3521,lng:103.8198,tier:1},
 {name:'SHANGHAI',lat:31.2304,lng:121.4737,tier:1},
 {name:'PARIS',lat:48.8566,lng:2.3522,tier:2},
 {name:'DUBAI',lat:25.2048,lng:55.2708,tier:2},
 {name:'SEOUL',lat:37.5665,lng:126.978,tier:2},
 {name:'HONG KONG',lat:22.3193,lng:114.1694,tier:2},
 {name:'TAIPEI',lat:25.033,lng:121.5654,tier:2},
 {name:'SYDNEY',lat:-33.8688,lng:151.2093,tier:2},
 {name:'LOS ANGELES',lat:34.0522,lng:-118.2437,tier:2},
 {name:'SAN FRANCISCO',lat:37.7749,lng:-122.4194,tier:3},
 {name:'VANCOUVER',lat:49.2827,lng:-123.1207,tier:3},
 {name:'SEATTLE',lat:47.6062,lng:-122.3321,tier:3},
 {name:'CHICAGO',lat:41.8781,lng:-87.6298,tier:3},
 {name:'TORONTO',lat:43.6532,lng:-79.3832,tier:3},
 {name:'MEXICO CITY',lat:19.4326,lng:-99.1332,tier:3},
 {name:'SAO PAULO',lat:-23.5505,lng:-46.6333,tier:3},
 {name:'BUENOS AIRES',lat:-34.6037,lng:-58.3816,tier:3},
 {name:'SANTIAGO',lat:-33.4489,lng:-70.6693,tier:3},
 {name:'REYKJAVIK',lat:64.1466,lng:-21.9426,tier:3},
 {name:'MADRID',lat:40.4168,lng:-3.7038,tier:3},
 {name:'ROME',lat:41.9028,lng:12.4964,tier:3},
 {name:'BERLIN',lat:52.52,lng:13.405,tier:3},
 {name:'AMSTERDAM',lat:52.3676,lng:4.9041,tier:3},
 {name:'STOCKHOLM',lat:59.3293,lng:18.0686,tier:3},
 {name:'HELSINKI',lat:60.1699,lng:24.9384,tier:3},
 {name:'ISTANBUL',lat:41.0082,lng:28.9784,tier:3},
 {name:'CAIRO',lat:30.0444,lng:31.2357,tier:3},
 {name:'NAIROBI',lat:-1.2864,lng:36.8172,tier:3},
 {name:'JOHANNESBURG',lat:-26.2041,lng:28.0473,tier:3},
 {name:'LAGOS',lat:6.5244,lng:3.3792,tier:3},
 {name:'RIYADH',lat:24.7136,lng:46.6753,tier:3},
 {name:'DOHA',lat:25.2854,lng:51.531,tier:3},
 {name:'MUMBAI',lat:19.076,lng:72.8777,tier:3},
 {name:'DELHI',lat:28.6139,lng:77.209,tier:3},
 {name:'BANGKOK',lat:13.7563,lng:100.5018,tier:3},
 {name:'KUALA LUMPUR',lat:3.139,lng:101.6869,tier:3},
 {name:'JAKARTA',lat:-6.2088,lng:106.8456,tier:3},
 {name:'MANILA',lat:14.5995,lng:120.9842,tier:3},
 {name:'HANOI',lat:21.0278,lng:105.8342,tier:3},
 {name:'BEIJING',lat:39.9042,lng:116.4074,tier:3},
 {name:'CHENGDU',lat:30.5728,lng:104.0668,tier:3},
 {name:'OSAKA',lat:34.6937,lng:135.5023,tier:3},
 {name:'BUSAN',lat:35.1796,lng:129.0756,tier:3},
 {name:'AUCKLAND',lat:-36.8509,lng:174.7645,tier:3},
 {name:'PERTH',lat:-31.9505,lng:115.8605,tier:3},
 {name:'HONOLULU',lat:21.3099,lng:-157.8581,tier:3},
 {name:'BOSTON',lat:42.3601,lng:-71.0589,tier:3},
 {name:'WASHINGTON DC',lat:38.9072,lng:-77.0369,tier:3},
 {name:'MIAMI',lat:25.7617,lng:-80.1918,tier:3},
 {name:'ZURICH',lat:47.3769,lng:8.5417,tier:3},
 {name:'VIENNA',lat:48.2082,lng:16.3738,tier:3},
 {name:'ATHENS',lat:37.9838,lng:23.7275,tier:3},
 {name:'CASABLANCA',lat:33.5731,lng:-7.5898,tier:3},
 {name:'TEL AVIV',lat:32.0853,lng:34.7818,tier:3},
];

export const activeRoutes=[
 ['NEW YORK','LONDON'],['NEW YORK','PARIS'],['NEW YORK','LOS ANGELES'],
 ['LOS ANGELES','TOKYO'],['LOS ANGELES','TAIPEI'],['LONDON','PARIS'],
 ['LONDON','DUBAI'],['LONDON','SINGAPORE'],['DUBAI','SINGAPORE'],
 ['DUBAI','SYDNEY'],['SINGAPORE','TOKYO'],['SINGAPORE','SHANGHAI'],
 ['SINGAPORE','SYDNEY'],['TOKYO','SEOUL'],['TOKYO','SYDNEY'],
 ['SEOUL','SHANGHAI'],['SHANGHAI','HONG KONG'],['HONG KONG','TAIPEI'],
].map(([from,to],index)=>({from,to,index}));

function greatCircleDistance(a,b){
 const lat1=a.lat*Math.PI/180;
 const lat2=b.lat*Math.PI/180;
 const dLat=lat2-lat1;
 const dLng=(b.lng-a.lng)*Math.PI/180;
 const haversine=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
 return 2*Math.asin(Math.sqrt(Math.min(1,haversine)));
}

function pairKey(a,b){return a<b?`${a}:${b}`:`${b}:${a}`;}

function buildStaticConnections(target=170){
 const activeNames=new Set(activeRoutes.map(({from,to})=>{
  const a=cities.findIndex(city=>city.name===from);
  const b=cities.findIndex(city=>city.name===to);
  return pairKey(a,b);
 }));
 const pairs=[];
 for(let a=0;a<cities.length;a++)for(let b=a+1;b<cities.length;b++){
  pairs.push({a,b,distance:greatCircleDistance(cities[a],cities[b])});
 }
 const selected=new Map();
 const degree=new Uint8Array(cities.length);
 const add=(pair,maxDegree=12)=>{
  const key=pairKey(pair.a,pair.b);
  if(activeNames.has(key)||selected.has(key)||degree[pair.a]>=maxDegree||degree[pair.b]>=maxDegree)return false;
  selected.set(key,{a:pair.a,b:pair.b});
  degree[pair.a]++;
  degree[pair.b]++;
  return true;
 };
 for(let cityIndex=0;cityIndex<cities.length;cityIndex++){
  pairs.filter(pair=>pair.a===cityIndex||pair.b===cityIndex)
   .sort((a,b)=>a.distance-b.distance)
   .slice(0,4)
   .forEach(pair=>add(pair));
 }
 const hash=({a,b})=>{
  const value=Math.sin((a+1)*127.1+(b+1)*311.7)*43758.5453;
  return value-Math.floor(value);
 };
 const longHaul=pairs.filter(pair=>pair.distance>.62).sort((a,b)=>hash(a)-hash(b));
 for(const pair of longHaul){if(selected.size>=target)break;add(pair,10);}
 if(selected.size<target){
  for(const pair of pairs.slice().sort((a,b)=>a.distance-b.distance)){
   if(selected.size>=target)break;
   add(pair,14);
  }
 }
 return [...selected.values()];
}

export const staticConnections=buildStaticConnections();
