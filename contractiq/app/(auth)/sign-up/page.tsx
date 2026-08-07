import Link from 'next/link'
import { AuthForm } from '@/components/auth/AuthForm'

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-h5 mb-6 text-grey-900">Create your account</h1>
        <AuthForm mode="sign-up" />
        <p className="mt-6 text-body-sm text-grey-500">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-blue-500 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
