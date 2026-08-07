'use client'

import { useAuthStore } from '@/store/auth-store'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { Skeleton } from '@/components/ui/Skeleton'

export function UserMenu() {
  const user = useAuthStore((state) => state.user)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading) {
    return <Skeleton className="h-6 w-40" />
  }

  if (!user) return null

  return (
    <div className="flex items-center gap-4">
      <span className="text-body-sm text-grey-500">{user.email}</span>
      <SignOutButton />
    </div>
  )
}
