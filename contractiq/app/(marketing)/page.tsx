import { LinkButton } from '@/components/ui/Button'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-24 text-center">
      <h1 className="text-h1 max-w-2xl text-grey-900">
        Understand what you&apos;re signing
      </h1>
      <p className="mt-6 max-w-xl text-body-lg text-grey-500">
        Upload an NDA or MSA and get key terms, confidence scores, and page-cited answers in
        minutes — no lawyer required.
      </p>
      <LinkButton href="/sign-up" className="mt-10">
        Get Started Free
      </LinkButton>
    </main>
  )
}
