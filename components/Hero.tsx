export default function Hero() {
  return (
    <section id="hero" className="relative space-y-4">
        <h1 className="text-2xl font-seasons mb-3" style={{ color: '#0b0d1a' }}>Where The River Flows</h1>
        <p className="text-base leading-relaxed" style={{ color: '#0b0d1a' }}>A social experiment to see just how connected we really are.</p>
        <hr className="divider-amber my-4" />
        <p className="text-base leading-relaxed" style={{ color: '#0b0d1a' }}>
          Thank you for making your way to this little mini-game. Recently, I came across the idea of <em>six degrees of separation</em> — the notion that everyone on Earth is linked through just six steps of connection. I wanted to test this theory in the real world, through music.
        </p>
        
        <h2 className="text-lg font-semibold mt-6 mb-2" style={{ color: '#0b0d1a' }}>How it works</h2>
        <p className="text-base leading-relaxed" style={{ color: '#0b0d1a' }}>
          When you sign up, you&apos;ll get a unique link to share with your friends. Each time someone joins through your link, your river grows. When they listen to the album and invite their own friends, their river connects to yours. Together, we can trace where the music flows — and as your chain grows, you collect paper boats that unlock exclusive perks.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2" style={{ color: '#0b0d1a' }}>Why</h2>
        <p className="text-base leading-relaxed" style={{ color: '#0b0d1a' }}>
          I might be old school, but most of the music I treasure came from friends who shared it with me. While the internet keeps getting louder, I want to bring back that simple joy: discovering music from someone you know and trust.
        </p>

        <h2 className="text-lg font-semibold mt-6 mb-2" style={{ color: '#0b0d1a' }}>Who I am</h2>
        <p className="text-base leading-relaxed" style={{ color: '#0b0d1a' }}>
          I&apos;m Eshaan Sood, a storyteller from New Delhi now in New York. My debut album &lsquo;Dream River&rsquo; is out everywhere — and this is my way of sending the boat sailing to every corner of the world.
        </p>
    </section>
  );
}

