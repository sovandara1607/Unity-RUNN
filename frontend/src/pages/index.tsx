import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 font-sans">
      <main className="flex flex-col flex-1 items-center justify-between py-32 px-16 bg-white">
        <Image
          className="dark:invert h-5 w-[100px]"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black">
            Welcome to Unity Run Club
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600">
            Log in or register to get started.
          </p>
          <div className="flex flex-col gap-4 text-base font-medium">
            <a
              href="/auth/login"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-white transition-colors"
            >
              <Image
                className="dark:invert h-[14px] w-4"
                src="/vercel.svg"
                alt="Vercel logomark"
                width={16}
                height={14}
              />
              Sign In
            </a>
            <a
              href="/auth/register"
              className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04]"
            >
              Register
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}