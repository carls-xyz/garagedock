const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { Pool } = require("pg");

// Le port sur lequel l'application écoute. 3000 si on ne précise rien.
const PORT = process.env.PORT || 3000;

// La connexion à la base.
// On ne met AUCUN mot de passe ici : la librairie "pg" lit toute seule les
// variables d'environnement PGHOST, PGPORT, PGUSER, PGPASSWORD et PGDATABASE.
// C'est Docker qui les fournira.
const pool = new Pool();

// Évite que l'application plante si la base disparaît en cours de route.
pool.on("error", (err) => {
  console.error("Base : connexion perdue (" + err.message + ")");
  baseConnectee = false;
  setTimeout(connecterLaBase, 2000);
});

let baseConnectee = false;
let dernierMessage = "";

// Quelques rendez-vous inventés, ajoutés si la table est vide.
const RENDEZ_VOUS_DE_DEPART = [
  ["Clio IV - AB-123-CD", "2026-10-12", "08:30 - 10:00", "Vidange + filtre à huile"],
  ["Peugeot 308 - EF-456-GH", "2026-10-12", "10:00 - 12:00", "Plaquettes de frein avant"],
  ["Golf 7 - IJ-789-KL", "2026-10-13", "14:00 - 15:00", "Montage pneus hiver"],
  ["Twingo III - MN-012-OP", "2026-10-14", "09:00 - 11:30", "Révision des 60 000 km"],
  ["Kangoo - QR-345-ST", "2026-10-15", "15:00 - 17:00", "Pré-contrôle technique"],
];

// Se connecte à la base, crée la table si besoin et ajoute les données de départ.
// Si la base n'est pas joignable, on réessaie toutes les 2 secondes
// au lieu de planter : l'application reste utilisable sans base.
async function connecterLaBase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id serial PRIMARY KEY,
        salle text NOT NULL,
        jour date NOT NULL,
        creneau text NOT NULL,
        motif text NOT NULL,
        cree_le timestamptz DEFAULT now()
      )
    `);

    const { rows } = await pool.query("SELECT count(*)::int AS total FROM reservations");
    if (rows[0].total === 0) {
      for (const r of RENDEZ_VOUS_DE_DEPART) {
        await pool.query(
          "INSERT INTO reservations (salle, jour, creneau, motif) VALUES ($1, $2, $3, $4)",
          r
        );
      }
      console.log("Base : table créée et remplie avec 5 rendez-vous d'exemple");
    }

    baseConnectee = true;
    console.log("Base : connectée");
  } catch (err) {
    baseConnectee = false;
    // On n'affiche le message que s'il change, pour ne pas inonder les logs.
    const message = "Base : non connectée (" + err.message + "), nouvel essai toutes les 2 s";
    if (message !== dernierMessage) console.log(message);
    dernierMessage = message;
    setTimeout(connecterLaBase, 2000);
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// La page web.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// L'état de l'application. "conteneur" est le nom de la machine :
// dans Docker, c'est l'identifiant du conteneur.
app.get("/api/sante", (req, res) => {
  res.json({
    api: "ok",
    base: baseConnectee ? "connectée" : "non connectée",
    conteneur: os.hostname(),
  });
});

// La liste des rendez-vous.
app.get("/api/reservations", async (req, res) => {
  if (!baseConnectee) {
    return res.status(503).json({ erreur: "base non connectée" });
  }
  try {
    const { rows } = await pool.query(
      "SELECT id, salle, to_char(jour, 'YYYY-MM-DD') AS jour, creneau, motif FROM reservations ORDER BY jour, creneau, id"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Ajouter un rendez-vous.
app.post("/api/reservations", async (req, res) => {
  if (!baseConnectee) {
    return res.status(503).json({ erreur: "base non connectée" });
  }
  const { salle, jour, creneau, motif } = req.body || {};
  if (!salle || !jour || !creneau || !motif) {
    return res.status(400).json({ erreur: "véhicule, jour, créneau et prestation sont obligatoires" });
  }
  try {
    const { rows } = await pool.query(
      "INSERT INTO reservations (salle, jour, creneau, motif) VALUES ($1, $2, $3, $4) RETURNING id, salle, to_char(jour, 'YYYY-MM-DD') AS jour, creneau, motif",
      [salle, jour, creneau, motif]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

// On démarre le serveur web tout de suite, puis on tente la base en tâche de fond.
app.listen(PORT, () => {
  console.log("Garage : application démarrée sur le port " + PORT);
  connecterLaBase();
});

// Arrêt propre quand Docker demande au conteneur de s'arrêter (docker stop).
process.on("SIGTERM", () => {
  console.log("Garage : arrêt demandé, au revoir");
  process.exit(0);
});