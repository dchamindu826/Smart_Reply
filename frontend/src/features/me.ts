import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MeResponse, UpdateMeInput } from '@smart-reply/shared';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/** `PATCH /me`: name, title, phone, language, signature and notification switches. */
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeInput) => api.patch<MeResponse>('/me', body),
    onSuccess: me => {
      qc.setQueryData(qk.me, me);
      // Names appear on staff lists too.
      void qc.invalidateQueries({ queryKey: qk.staff });
    }
  });
}

/** `POST /me/password`. Other devices are signed out by the API. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api.post<void>('/me/password', body)
  });
}
