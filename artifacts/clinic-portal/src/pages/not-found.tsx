import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="text-center space-y-6">
        <h1 className="text-6xl font-bold text-gray-200">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800">Page Not Found</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button className="mt-4">Return Home</Button>
        </Link>
      </div>
    </div>
  );
}
