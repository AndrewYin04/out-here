import { HomeFeed, OutHereCard } from '@/features/fb/feed';

export default function HomePage() {
  return (
    <>
      <h1 className="sr-only">Home</h1>
      <HomeFeed>
        <OutHereCard />
      </HomeFeed>
    </>
  );
}
