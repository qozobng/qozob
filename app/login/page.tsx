import { login, signup } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string; error: string }
}) {
  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mx-auto min-h-screen">
      <form className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground">
        <h1 className="text-3xl font-black text-indigo-950 mb-8">Join Qozob.</h1>
        
        <label className="text-md font-bold" htmlFor="email">Email Address</label>
        <input
          className="rounded-xl px-4 py-3 bg-white border border-slate-200 mb-4 outline-none focus:border-emerald-500"
          name="email"
          placeholder="you@example.com"
          required
        />
        
        <label className="text-md font-bold" htmlFor="password">Password</label>
        <input
          className="rounded-xl px-4 py-3 bg-white border border-slate-200 mb-6 outline-none focus:border-emerald-500"
          type="password"
          name="password"
          placeholder="••••••••"
          required
        />

        <button
          formAction={login}
          className="bg-indigo-900 rounded-xl px-4 py-3 text-white font-black mb-2 hover:bg-indigo-800 transition-all"
        >
          Sign In
        </button>
        <button
          formAction={signup}
          className="border border-indigo-900 rounded-xl px-4 py-3 text-indigo-900 font-bold hover:bg-indigo-50 transition-all"
        >
          Create Free Account
        </button>

        {searchParams?.message && (
          <p className="mt-4 p-4 bg-emerald-50 text-emerald-700 text-center font-bold rounded-lg border border-emerald-100">
            {searchParams.message}
          </p>
        )}
        {searchParams?.error && (
          <p className="mt-4 p-4 bg-red-50 text-red-700 text-center font-bold rounded-lg border border-red-100">
            {searchParams.error}
          </p>
        )}
      </form>
    </div>
  )
}