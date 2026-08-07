import Link from 'next/link'
import { UserMenu } from '@/components/auth/UserMenu'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-grey-25">
      <nav className="flex items-center justify-between border-b border-grey-100 bg-white px-28 py-4">
        <Link href="/dashboard" className="text-h5 text-grey-900">
          ContractIQ
        </Link>
        <UserMenu />
      </nav>
      {children}
    </div>
  )
}
