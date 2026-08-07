'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

interface AuthFormProps {
  mode: 'sign-up' | 'sign-in'
}

const DUPLICATE_EMAIL = 'duplicate_email'

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const supabase = createClient()

    if (mode === 'sign-up') {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

      if (signUpError) {
        setIsSubmitting(false)
        setError(/already registered|already exists/i.test(signUpError.message)
          ? DUPLICATE_EMAIL
          : signUpError.message)
        return
      }

      // Supabase returns a user with an empty identities array (no error) when the email is
      // already registered, to avoid leaking which emails exist in the system.
      if (data.user && data.user.identities?.length === 0) {
        setIsSubmitting(false)
        setError(DUPLICATE_EMAIL)
        return
      }

      setIsSubmitting(false)

      if (!data.session) {
        setCheckEmail(true)
        return
      }

      router.push('/dashboard')
      router.refresh()
      return
    }

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setIsSubmitting(false)

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setError(body?.error?.message ?? 'Invalid email or password.')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (checkEmail) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body-lg text-grey-900">Check your email to confirm your account</p>
        <p className="text-body-sm text-grey-500">
          We sent a confirmation link to {email}. Click it to finish creating your account.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <Input
        type="email"
        label="Email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        type="password"
        label="Password"
        required
        minLength={6}
        autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error === DUPLICATE_EMAIL ? (
        <p className="text-body-sm text-red-700">
          An account with this email already exists —{' '}
          <Link href="/sign-in" className="underline">
            sign in instead
          </Link>
          .
        </p>
      ) : error ? (
        <p role="alert" className="text-body-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting
          ? mode === 'sign-up'
            ? 'Creating account…'
            : 'Signing in…'
          : mode === 'sign-up'
            ? 'Create account'
            : 'Sign in'}
      </Button>
    </form>
  )
}
