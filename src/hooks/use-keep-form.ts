"use client";

import { useTransition, type FormEvent } from "react";

/**
 * Envoie un formulaire à son action serveur sans le réinitialiser : en cas
 * d'erreur, tout ce qui a été saisi reste à l'écran pour être corrigé.
 * (Avec `<form action>`, React vide les champs après chaque envoi.)
 */
export function useKeepForm(formAction: (formData: FormData) => void) {
  const [pending, startTransition] = useTransition();
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(formData));
  }
  return { onSubmit, pending };
}
