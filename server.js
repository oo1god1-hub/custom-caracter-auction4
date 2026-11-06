const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeRoom = String(req.params.code || "").replace(/[^a-z0-9]/gi, "");
    const safeChar = String(req.params.characterId || "").replace(/[^a-z0-9]/gi, "");
    cb(null, `${safeRoom}-${safeChar}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mimetype)) {
      return cb(new Error("Please upload a PNG, JPG, WEBP, or GIF image."));
    }
    cb(null, true);
  }
});

const STARTING_BUDGET = 10000;
const characters = [
  { id:"sheetal", name:"Sheetal", tier:"SSS", power:100, price:3000, rarity:"Ultimate Legendary", ability:"Ability to be configured", description:"Top-ranked character." },
  { id:"mannat", name:"Mannat", tier:"SS", power:95, price:2500, rarity:"Legendary", ability:"Ability to be configured", description:"Legendary character." },
  { id:"namrata", name:"Namrata", tier:"A", power:78, price:1500, rarity:"Rare", ability:"Ability to be configured", description:"Rare character." },
  { id:"riya", name:"Riya", tier:"SSS", power:99, price:2900, rarity:"Ultimate Legendary", ability:"Ability to be configured", description:"Second-highest power." },
  { id:"vibha", name:"Vibha", tier:"A", power:76, price:1400, rarity:"Rare", ability:"Ability to be configured", description:"Rare character." },
  { id:"wacha", name:"Wacha", tier:"B", power:68, price:1000, rarity:"Uncommon", ability:"Ability to be configured", description:"Uncommon character." },
  { id:"raanu", name:"Raanu", tier:"SS", power:89, price:2200, rarity:"Legendary", ability:"Ability to be configured", description:"Legendary character." },
  { id:"trisha", name:"Trisha", tier:"SS", power:93, price:2400, rarity:"Legendary", ability:"Ability to be configured", description:"Legendary character." },
  { id:"himani", name:"Himani", tier:"S", power:84, price:1800, rarity:"Epic", ability:"Ability to be configured", description:"Epic character." },
  { id:"sikha", name:"Sikha", tier:"A", power:74, price:1300, rarity:"Rare", ability:"Ability to be configured", description:"Rare character." },
  { id:"chanchal", name:"Chanchal", tier:"SSS", power:98, price:2800, rarity:"Ultimate Legendary", ability:"Ability to be configured", description:"Third-highest power." },
  { id:"kashish", name:"Kashish", tier:"SS", power:91, price:2300, rarity:"Legendary", ability:"Ability to be configured", description:"Legendary character." },
  { id:"manvi", name:"Manvi", tier:"S", power:86, price:1900, rarity:"Epic", ability:"Ability to be configured", description:"Epic character." },
  { id:"rasmi", name:"Rasmi", tier:"B", power:70, price:1100, rarity:"Uncommon", ability:"Ability to be configured", description:"Uncommon character." },
  { id:"archana", name:"Archana", tier:"S", power:82, price:1700, rarity:"Epic", ability:"Ability to be configured", description:"Epic character." }
];

const rooms = new Map();
const cloneCharacters = () => characters.map(c => ({ ...c, imageUrl: null }));

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({length:6}, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: room.players.map(p => ({
      id:p.id, name:p.name, budget:p.budget,
      characters:p.characters.map(c => ({id:c.id,name:c.name,tier:c.tier,power:c.power,pricePaid:c.pricePaid,imageUrl:c.imageUrl})),
      totalPower:p.characters.reduce((sum,c)=>sum+c.power,0)
    })),
    characters: room.characters,
    auctionIndex: room.auctionIndex,
    currentAuction: room.currentAuction,
    history: room.history.slice(-15),
    winnerId: room.winnerId || null
  };
}
function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}
function playerById(room, id) {
  return room.players.find(p => p.id === id);
}
function closeAuction(room) {
  if (!room.currentAuction) return;
  const auction = room.currentAuction;
  if (auction.highestBidderId) {
    const winner = playerById(room, auction.highestBidderId);
    const character = room.characters.find(c => c.id === auction.characterId);
    if (winner && character && !room.soldIds.has(character.id)) {
      winner.budget -= auction.highestBid;
      winner.characters.push({ ...character, pricePaid: auction.highestBid });
      room.soldIds.add(character.id);
      room.history.push(`${character.name} SOLD to ${winner.name} for ${auction.highestBid.toLocaleString()} coins`);
    }
  } else {
    const character = room.characters.find(c => c.id === auction.characterId);
    room.history.push(`${character.name} went UNSOLD`);
  }
  room.currentAuction = null;
  room.auctionIndex += 1;
  emitRoom(room);
  setTimeout(() => advanceAuction(room.code), 1600);
}
function advanceAuction(code) {
  const room = rooms.get(code);
  if (!room || room.status !== "auction" || room.currentAuction) return;
  if (room.auctionIndex >= room.characters.length) {
    room.status = "finished";
    const ranked = [...room.players].sort((a,b) => {
      const powerB = b.characters.reduce((s,c)=>s+c.power,0);
      const powerA = a.characters.reduce((s,c)=>s+c.power,0);
      return powerB - powerA;
    });
    const topPower = ranked[0]?.characters.reduce((s,c)=>s+c.power,0) || 0;
    const tied = ranked.filter(p => p.characters.reduce((s,c)=>s+c.power,0) === topPower);
    room.winnerId = tied.length > 1 ? "tie" : ranked[0]?.id;
    emitRoom(room);
    return;
  }
  const character = room.characters[room.auctionIndex];
  room.currentAuction = {
    characterId: character.id,
    startingPrice: character.price,
    highestBid: character.price,
    highestBidderId: null,
    endsAt: Date.now() + 20000
  };
  emitRoom(room);
  room.timer = setTimeout(() => {
    const latest = rooms.get(code);
    if (latest && latest.status === "auction" && latest.currentAuction &&
        latest.currentAuction.characterId === character.id) closeAuction(latest);
  }, 20000);
}

io.on("connection", socket => {
  socket.on("room:create", ({name}, cb) => {
    const playerName = String(name || "").trim().slice(0,20);
    if (!playerName) return cb?.({ok:false,error:"Enter your player name."});
    const code = makeCode();
    const player = { id:socket.id, name:playerName, budget:STARTING_BUDGET, characters:[] };
    const room = {
      code, hostId:socket.id, players:[player], status:"waiting",
      characters:cloneCharacters(), auctionIndex:0, currentAuction:null,
      history:[], soldIds:new Set(), winnerId:null, timer:null
    };
    rooms.set(code, room);
    socket.join(code);
    cb?.({ok:true, code});
    emitRoom(room);
  });

  socket.on("room:join", ({code,name}, cb) => {
    const roomCode = String(code || "").trim().toUpperCase();
    const room = rooms.get(roomCode);
    const playerName = String(name || "").trim().slice(0,20);
    if (!playerName) return cb?.({ok:false,error:"Enter your player name."});
    if (!room) return cb?.({ok:false,error:"Room code not found."});
    if (room.status !== "waiting") return cb?.({ok:false,error:"This auction has already started."});
    if (room.players.length >= 3) return cb?.({ok:false,error:"This room is full (maximum 3 players)."});
    if (room.players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      return cb?.({ok:false,error:"That player name is already being used in this room."});
    }
    const player = { id:socket.id, name:playerName, budget:STARTING_BUDGET, characters:[] };
    room.players.push(player);
    socket.join(room.code);
    cb?.({ok:true, code:room.code});
    emitRoom(room);
  });

  socket.on("auction:start", cb => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room) return cb?.({ok:false,error:"You are not in a room."});
    if (room.hostId !== socket.id) return cb?.({ok:false,error:"Only the host can start the auction."});
    if (room.status !== "waiting") return cb?.({ok:false,error:"Auction has already started."});
    if (room.players.length < 2) return cb?.({ok:false,error:"At least 2 players are required."});
    room.status = "auction";
    room.auctionIndex = 0;
    emitRoom(room);
    advanceAuction(room.code);
    cb?.({ok:true});
  });

  socket.on("bid:place", ({amount}, cb) => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || room.status !== "auction" || !room.currentAuction) {
      return cb?.({ok:false,error:"There is no active auction."});
    }
    const player = playerById(room, socket.id);
    const bid = Number(amount);
    const auction = room.currentAuction;
    if (!Number.isSafeInteger(bid) || bid <= auction.highestBid) {
      return cb?.({ok:false,error:`Your bid must be a whole number higher than ${auction.highestBid.toLocaleString()}.`});
    }
    if (bid > player.budget) return cb?.({ok:false,error:"Your bid is higher than your remaining budget."});
    const character = room.characters.find(c => c.id === auction.characterId);
    if (!character || room.soldIds.has(character.id)) return cb?.({ok:false,error:"This character is no longer available."});
    auction.highestBid = bid;
    auction.highestBidderId = player.id;
    auction.endsAt = Date.now() + 10000;
    room.history.push(`${player.name} bid ${bid.toLocaleString()} for ${character.name}`);
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      const latest = rooms.get(room.code);
      if (latest && latest.currentAuction?.characterId === character.id) closeAuction(latest);
    }, 10000);
    emitRoom(room);
    cb?.({ok:true});
  });

  socket.on("room:leave", () => {
    removePlayer(socket);
  });

  socket.on("disconnect", () => removePlayer(socket));
});

function removePlayer(socket) {
  for (const [code, room] of rooms.entries()) {
    const index = room.players.findIndex(p => p.id === socket.id);
    if (index === -1) continue;
    if (room.status === "waiting") {
      room.players.splice(index,1);
      if (!room.players.length) rooms.delete(code);
      else {
        if (room.hostId === socket.id) room.hostId = room.players[0].id;
        emitRoom(room);
      }
    } else {
      const player = room.players[index];
      player.connected = false;
      // Keep the player and their budget/team in the room; reconnect support can be added using a player token.
      emitRoom(room);
    }
    break;
  }
}

app.post("/api/rooms/:code/characters/:characterId/image", (req, res) => {
  upload.single("image")(req, res, err => {
    if (err) return res.status(400).json({error:err.message});
    const room = rooms.get(String(req.params.code).toUpperCase());
    if (!room) return res.status(404).json({error:"Room not found."});
    const socketId = req.get("x-socket-id");
    if (room.hostId !== socketId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({error:"Only the room host can upload character images."});
    }
    if (room.status !== "waiting") {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({error:"Images can only be changed before the auction starts."});
    }
    const character = room.characters.find(c => c.id === req.params.characterId);
    if (!character) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({error:"Character not found."});
    }
    character.imageUrl = `/uploads/${req.file.filename}`;
    emitRoom(room);
    res.json({ok:true,imageUrl:character.imageUrl});
  });
});

app.get("/api/health", (_req,res) => res.json({ok:true,rooms:rooms.size}));
server.listen(PORT, "0.0.0.0", () => console.log(`Auction game running on port ${PORT}`));
