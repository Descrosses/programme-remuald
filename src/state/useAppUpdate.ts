/**
 * Détection des mises à jour de l'application.
 *
 * Une PWA installée garde sa version en cache. Sans signal, on ouvre l'appli
 * après un déploiement et « rien n'a changé » — alors que la nouvelle version
 * est déjà téléchargée et attend.
 *
 * On ne recharge jamais tout seul : ça pourrait tomber au milieu d'une série.
 * L'appli propose, l'utilisateur décide.
 */

import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface AppUpdate {
  /** Une nouvelle version est installée et prête. */
  ready: boolean;
  /** L'appli fonctionne désormais hors ligne (premier passage du cache). */
  offlineReady: boolean;
  /** Applique la nouvelle version et recharge. */
  update: () => void;
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdate {
  const [ready, setReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateFn, setUpdateFn] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setReady(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
    setUpdateFn(() => () => update(true));

    // Vérifie s'il y a du nouveau à chaque retour au premier plan : c'est le
    // moment naturel où l'on ouvre l'appli avant une séance.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void navigator.serviceWorker?.getRegistration().then((r) => r?.update());
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return {
    ready,
    offlineReady,
    update: () => {
      /*
       * Sur iPhone, l'appui pouvait ne rien faire : le nouveau service worker
       * s'active, mais l'événement qui déclenche le rechargement n'arrive pas
       * toujours dans une appli installée sur l'écran d'accueil. On recharge
       * donc nous-mêmes dès que le nouveau service worker prend la main, et
       * au plus tard après 2 s, quoi qu'il arrive.
       */
      navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload());
      void updateFn?.();
      window.setTimeout(() => window.location.reload(), 2000);
    },
    dismiss: () => setReady(false),
  };
}
