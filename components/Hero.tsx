export default function Hero() {
  return (
    <section id="hero" className="max-w-2xl mx-auto p-6 space-y-4">
      {/* Mobile condensed copy */}
      <div className="lg:hidden space-y-4">
        <h1 className="text-2xl font-seasons">Where The River Flows</h1>
        <p className="italic text-sm text-muted-foreground">Can music prove how connected we really are?</p>
        <p className="text-sm text-foreground">
          I was inspired by the idea of <em>six degrees of separation</em> — that anyone on Earth is only six steps away. This page is my way of testing it through music.
        </p>
        <h3 className="font-semibold">How it works:</h3>
        <p className="text-sm text-foreground">
          Sign up and get your unique link. Each friend who joins grows your river. When they listen and invite others, their rivers connect to yours. Together we’ll trace how the album spreads — and along the way, you’ll collect paper boats to unlock exclusive perks.
        </p>
        <h3 className="font-semibold">Why:</h3>
        <p className="text-sm text-foreground">
          The music that’s stayed with me has always come from friends. I want to bring back that joy of sharing music personally, even in today’s noisy internet.
        </p>
        <h3 className="font-semibold">Who I am:</h3>
        <p className="text-sm text-foreground">
          I’m <strong>Eshaan Sood</strong>, a storyteller from New Delhi now in New York. My debut album <em>Dream River</em> is out everywhere — and this is my way of sending the boat sailing to every corner of the world.
        </p>
      </div>

      {/* Desktop full copy */}
      <div className="hidden lg:block space-y-4">
        <h1 className="text-2xl font-seasons">Where The River Flows</h1>
        <p className="italic text-sm text-muted-foreground">A social experiment to see just how connected we really are.</p>
        <hr className="divider-amber" />
        <p className="text-sm text-foreground">
          Thank you for making your way to this little mini-game. Recently, I came across the idea of <em>six degrees of separation</em> — the notion that everyone on Earth is linked through just six steps of connection. I wanted to test this theory in the real world, through music.
        </p>
        <h3 className="font-semibold">So what’s the experiment?</h3>
        <p className="text-sm text-foreground">
          When you sign up, you’ll get a unique link to share with your friends. Each time someone joins through your link, your river grows. When they listen to the album and invite their own friends, their river connects to yours. Together, we can trace where the music flows — and as your chain grows, you collect paper boats that unlock exclusive perks.
        </p>
        <h3 className="font-semibold">Why this experiment?</h3>
        <p className="text-sm text-foreground">
          I might be old school, but most of the music I treasure came from friends who shared it with me. While the internet keeps getting louder, I want to bring back that simple joy: discovering music from someone you know and trust.
        </p>
        <h3 className="font-semibold">Who am I?</h3>
        <p className="text-sm text-foreground">
          My name is <strong>Eshaan Sood</strong>. I’m a storyteller from New Delhi, India, now based in New York. My debut album <em>Dream River</em> is out everywhere — and this page is my way of sending the boat sailing to every corner of the world.
        </p>
      </div>
    </section>
  );
}

