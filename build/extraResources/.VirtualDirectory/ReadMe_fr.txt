# Guide du Répertoire Virtuel

## Aperçu

`.VirtualDirectory` est un répertoire virtuel généré automatiquement par cette application, utilisé pour afficher la structure des fichiers après une organisation intelligente. Il maintient une correspondance un-à-un avec les fichiers du répertoire original, mais utilise un nommage intelligent.

## Objectif

L'objectif principal de ce répertoire virtuel est de permettre aux utilisateurs de prévisualiser les résultats de l'organisation des fichiers sans déplacer ou copier réellement les fichiers originaux.
Lorsque vous êtes satisfait du résultat final, vous pouvez cliquer sur "Organiser le Répertoire Réel" pour organiser le répertoire réel afin qu'il corresponde à la structure de fichiers de .VirtualDirectory, puis cette application supprimera le répertoire .VirtualDirectory.

## Principes Techniques

### Technologie de Liens Physiques

Les fichiers du répertoire virtuel sont générés en utilisant la technologie de liens physiques. Les liens physiques peuvent être simplement compris comme des références ou des alias de fichiers, avec les caractéristiques suivantes :

1. Aucun espace disque physique supplémentaire n'est occupé
2. Partage les mêmes blocs de données avec le fichier original
3. Les modifications apportées aux fichiers liés physiquement sont synchronisées avec le fichier original
4. La suppression d'un fichier lié physiquement n'affecte pas le fichier original
5. Lors de la suppression du fichier original, il est nécessaire de supprimer le fichier lié physiquement (cette application détectera activement les suppressions de fichiers dans le répertoire réel et supprimera en conséquence les fichiers liés physiquement dans le répertoire virtuel.)

### Différence avec les Raccourcis

Bien que les liens physiques ressemblent à des raccourcis dans une certaine mesure, il existe des différences importantes entre eux :

| Caractéristique | Raccourcis | Liens Physiques |
|----------------|------------|-----------------|
| Niveau Système de Fichiers | Concept Windows uniquement | Fonctionnalité du système de fichiers du système d'exploitation |
| Espace Occupé | Minimal (métadonnées uniquement) | Aucun espace supplémentaire |
| Suppression du Fichier Original | Le raccourci devient invalide | Le lien physique peut encore accéder au contenu du fichier |
| Modification du Contenu | N'affecte pas le fichier original | Synchronisé sur tous les liens |
| Support Inter-volumes | Pris en charge | Limité au même système de fichiers |