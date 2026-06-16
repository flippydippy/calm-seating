// Auth users — PBKDF2-SHA256 hashes (NOT plaintext). Created by us; no self-signup.
// Login re-hashes the typed password with the stored salt and compares.
// Classic script: exposes window.CS_USERS for the pre-engine auth layer.
window.CS_USERS = [
  {
    "username": "yar",
    "role": "admin",
    "salt": "a8d6d9cd17fde282124c6aa007337e03",
    "hash": "4bd225e7eb90c8ef9c63d95b74ef0c1aedbcb0ab6383bb4a6d6acc80f29f4c2d",
    "iter": 200000
  },
  {
    "username": "daryoush",
    "role": "user",
    "salt": "c50d99634be7d75d674f7070fb59970b",
    "hash": "2b853e7679b165cba7aa346b1cf622e9bb87496cd9849fe65c0ffd191956a1de",
    "iter": 200000
  },
  {
    "username": "hasti",
    "role": "user",
    "salt": "de41d70218ba504995b5f90129dd2ebd",
    "hash": "27a84f417a2dcecbdc70902afb1485997e1857098849090e1085a6f7f964f7c9",
    "iter": 200000
  },
  {
    "username": "farahnaz",
    "role": "user",
    "salt": "07c6b5e931b3b681bd22be1b2c58a975",
    "hash": "c30586bb59cbdcb1b6f201134ccc9689a33b38dcb6963d06dc43d4254336b145",
    "iter": 200000
  }
];
