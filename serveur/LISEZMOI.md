# Serveur du classement StepCoach

Le classement (pseudo + temps de musique) est stocké dans un Google Sheet qui t'appartient. Un petit script
Google Apps Script sert d'API. C'est gratuit et ne demande pas de carte bancaire.

## Installation (5 minutes, une seule fois)

1. Va sur <https://sheets.new> (connecté à ton compte Google) et nomme la feuille « StepCoach classement ».
2. Menu **Extensions → Apps Script**. Efface tout le contenu de `Code.gs`, puis colles-y le fichier
   [`classement.gs`](classement.gs) en entier. Enregistre (icône disquette).
3. Bouton **Déployer → Nouveau déploiement**.
   - Roue dentée « Sélectionner le type » : **Application Web**.
   - Exécuter en tant que : **Moi**.
   - Qui a accès : **Tout le monde**.
   - Clique sur **Déployer**, puis **Autoriser l'accès**. Choisis ton compte, puis « Paramètres avancés » →
     « Accéder à … (non sécurisé) » → **Autoriser**. C'est ton propre script, Google affiche cet avertissement
     simplement parce qu'il n'a pas été vérifié.
4. Copie l'**URL de l'application Web** (elle se termine par `/exec`) et colle-la dans `config.js` :
   `leaderboardUrl: 'https://script.google.com/macros/s/…/exec'`.

## Mettre le script à jour

Colle la nouvelle version dans `Code.gs`, puis **Déployer → Gérer les déploiements → ✏️ → Version :
Nouvelle version → Déployer**. L'URL ne change pas.

## Modération

L'onglet `joueurs` du Sheet contient tous les joueurs :

- tu peux corriger un pseudo directement dans la colonne `pseudo` ;
- tu peux supprimer la ligne d'un tricheur ;
- ne touche pas aux colonnes `id` et `cle`, sinon le joueur perd son compte.

## Règles anti-triche

- Seul le temps où la musique joue vraiment est compté : page visible, vidéo qui avance, son non coupé.
- C'est l'heure du serveur qui fait foi. Changer l'heure de son appareil ne sert à rien.
- Un envoi ne peut pas compter plus que le temps réellement écoulé depuis le précédent. Deux onglets ou
  deux appareils en même temps ne comptent pas double.
- Toutes les 20 minutes de musique, l'appli met en pause et demande « Je continue ». Sans réponse, plus rien
  ne compte : laisser tourner une longue vidéo ne rapporte rien.
- Le temps compté est plafonné à 5 h par jour.

Les réglages sont en haut de `classement.gs` : `PAUSE_S`, `MAX_ENVOI`, `MAX_JOUR`.
