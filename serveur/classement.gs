/**
 * StepCoach — serveur du classement (Google Apps Script, gratuit, sans carte bancaire).
 * Installation : voir LISEZMOI.md dans ce dossier.
 *
 * Les joueurs et leurs temps sont dans l'onglet « joueurs » du Google Sheet : tu peux y renommer un pseudo
 * ou supprimer une ligne (tricheur, pseudo déplacé) à la main.
 *
 * Anti-triche :
 *  - c'est l'horloge du SERVEUR qui compte : changer l'heure ou la date de son téléphone ne sert à rien ;
 *  - un envoi ne compte jamais plus que le temps réellement écoulé depuis l'envoi précédent du même joueur
 *    (deux onglets ou deux appareils en même temps ne comptent pas double), et jamais plus de MAX_ENVOI s ;
 *  - après PAUSE_S secondes de musique, plus rien ne compte tant que le joueur n'a pas confirmé « je continue »
 *    (l'appli met la musique en pause et pose la question) : laisser tourner une longue vidéo ne rapporte rien ;
 *  - plafond de MAX_JOUR secondes comptées par jour.
 */
const PAUSE_S = 20 * 60;
const MAX_ENVOI = 90;
const MAX_JOUR = 5 * 3600;
const FUSEAU = 'Europe/Paris';
const ONGLET = 'joueurs';
const COLS = ['id', 'cle', 'pseudo', 'total_s', 'jour_s', 'date', 'dernier', 'cree_le', 'depuis_pause_s', 'attente'];
const INTERDITS = ['admin', 'moderat', 'stepcoach', 'connard', 'conasse', 'salope', 'pute', 'encule', 'nique', 'batard', 'pd', 'nazi', 'hitler', 'fdp', 'ntm'];

function doPost(e) {
  return reponse(() => {
    const q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (q.a === 'top') return top(q.id);
    const verrou = LockService.getScriptLock();
    verrou.waitLock(15000);
    try {
      if (q.a === 'inscription') return inscription(q);
      if (q.a === 'temps') return temps(q);
      if (q.a === 'continuer') return continuer(q);
      throw new Error('action inconnue');
    } finally { verrou.releaseLock(); }
  });
}
function doGet() { return reponse(() => ({ ok: true, service: 'classement StepCoach' })); }
function reponse(fn) {
  let out;
  try { out = fn(); } catch (err) { out = { ok: false, err: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function onglet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(ONGLET);
  if (!sh) { sh = ss.insertSheet(ONGLET); sh.appendRow(COLS); sh.setFrozenRows(1); }
  return sh;
}
function lignes(sh) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, COLS.length).getValues() : [];
}
const empreinte = s => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s)));
const jourDe = ms => Utilities.formatDate(new Date(ms), FUSEAU, 'yyyyMMdd');
function joueur(sh, q) {
  const data = lignes(sh), i = data.findIndex(r => String(r[0]) === String(q.id));
  if (i < 0 || String(data[i][1]) !== empreinte(q.cle)) throw new Error('joueur inconnu');
  return { data, i, r: data[i], ligne: i + 2 };
}
function pseudoPropre(p) {
  p = String(p || '').replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}\p{N} _.\-]{3,20}$/u.test(p)) throw new Error('Pseudo : 3 à 20 caractères (lettres, chiffres, espace, - _ .)');
  const plat = p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  if (INTERDITS.some(w => w.length > 2 ? plat.includes(w) : plat === w)) throw new Error('Ce pseudo n\'est pas autorisé');
  return p;
}

function inscription(q) {
  const sh = onglet(), p = pseudoPropre(q.pseudo), data = lignes(sh), bas = p.toLowerCase();
  const moi = q.id && q.cle ? data.findIndex(r => String(r[0]) === String(q.id) && String(r[1]) === empreinte(q.cle)) : -1;
  if (data.some((r, i) => i !== moi && String(r[2]).toLowerCase() === bas)) throw new Error('Ce pseudo est déjà pris');
  if (moi >= 0) { sh.getRange(moi + 2, 3).setValue(p); return { ok: true, id: q.id, cle: q.cle, pseudo: p }; }
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 12), cle = Utilities.getUuid() + Utilities.getUuid();
  const now = Date.now();
  sh.appendRow([id, empreinte(cle), p, 0, 0, jourDe(now), now, new Date(now), 0, false]);
  return { ok: true, id, cle, pseudo: p };
}

// envoi régulier (≈ toutes les minutes) du temps de musique écouté depuis l'envoi précédent
function temps(q) {
  const sh = onglet(), j = joueur(sh, q), now = Date.now(), d = jourDe(now);
  let total = +j.r[3] || 0, jour = +j.r[4] || 0, date = String(j.r[5]), dernier = +j.r[6] || now;
  let acc = +j.r[8] || 0, attente = j.r[9] === true || j.r[9] === 'TRUE';
  if (date !== d) { jour = 0; date = d; }
  const ecoule = Math.max(0, (now - dernier) / 1000);
  let compte = 0;
  if (!attente) {
    compte = Math.min(Math.max(0, +q.s || 0), MAX_ENVOI, ecoule, Math.max(0, MAX_JOUR - jour));
    total += compte; jour += compte; acc += compte;
    if (acc >= PAUSE_S) attente = true;
  }
  sh.getRange(j.ligne, 4, 1, 7).setValues([[total, jour, date, now, j.r[7], acc, attente]]);
  return { ok: true, compte: Math.round(compte), total: Math.floor(total), jour: Math.floor(jour), pause: attente, plafond: jour >= MAX_JOUR };
}

// « je continue » : accepté quand la pause est due (ou presque), pour repartir pour PAUSE_S secondes
function continuer(q) {
  const sh = onglet(), j = joueur(sh, q), acc = +j.r[8] || 0, attente = j.r[9] === true || j.r[9] === 'TRUE';
  if (attente || acc >= PAUSE_S - 300) sh.getRange(j.ligne, 7, 1, 4).setValues([[Date.now(), j.r[7], 0, false]]);
  return { ok: true };
}

function top(id) {
  const d = jourDe(Date.now());
  const tous = lignes(onglet()).map(r => ({ id: String(r[0]), p: String(r[2]), t: +r[3] || 0, j: String(r[5]) === d ? (+r[4] || 0) : 0 }));
  const classe = k => {
    const l = tous.filter(x => x[k] >= 1).sort((a, b) => b[k] - a[k]);
    return { liste: l.slice(0, 50).map(x => ({ p: x.p, s: Math.floor(x[k]), moi: x.id === String(id) || undefined })),
             rang: id ? l.findIndex(x => x.id === String(id)) + 1 : 0, n: l.length };
  };
  const moi = tous.find(x => x.id === String(id));
  return { ok: true, jour: classe('j'), total: classe('t'), moi: moi ? { p: moi.p, t: Math.floor(moi.t), j: Math.floor(moi.j) } : null, joueurs: tous.length };
}
