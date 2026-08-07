import Link from 'next/link'
import { AuthForm } from '@/components/auth/AuthForm'

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-h5 mb-6 text-grey-900">Sign in</h1>
        <AuthForm mode="sign-in" />
        <p className="mt-6 text-body-sm text-grey-500">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="text-blue-500 underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  )
}
