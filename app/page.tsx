import CGTCalculator from './components/CGTCalculator';

export default function Home() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <main className="w-full max-w-5xl px-4 py-16 sm:px-8">
                <CGTCalculator />
            </main>
        </div>
    );
}
