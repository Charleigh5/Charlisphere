/**
 * sampleMemories.ts
 * Curated high-fidelity memory datasets with realistic EXIF, geolocations, colors, and timestamps.
 */

import { PhotoMemoryItem } from '../types';

const SAMPLE_LOCATIONS = [
  { name: 'Laguna Beach, CA', lat: 33.5427, lng: -117.7854 },
  { name: 'Yosemite Valley, CA', lat: 37.7456, lng: -119.5936 },
  { name: 'Waikiki Beach, Honolulu, HI', lat: 21.2766, lng: -157.8285 },
  { name: 'Banff National Park, Alberta', lat: 51.1784, lng: -115.5708 },
  { name: 'Tokyo Tower, Japan', lat: 35.6586, lng: 139.7454 },
  { name: 'Eiffel Tower, Paris, France', lat: 48.8584, lng: 2.2945 },
  { name: 'Central Park, New York, NY', lat: 40.7851, lng: -73.9683 },
  { name: 'Lake Tahoe, NV', lat: 39.0968, lng: -120.0324 },
  { name: 'Grand Canyon, AZ', lat: 36.1069, lng: -112.1129 },
  { name: 'Santorini, Greece', lat: 36.3932, lng: 25.4615 },
  { name: 'Kyoto Arashiyama, Japan', lat: 35.0165, lng: 135.6713 },
  { name: 'Maui Coastline, HI', lat: 20.7984, lng: -156.3319 },
];

const MEMORY_TITLES = [
  'First Steps on the Living Room Rug',
  'Golden Hour at Sunset Beach',
  'Bella the Retriever Chasing Bubbles',
  'First Birthday Cake Smash Milestone',
  'Yosemite Pine Trail Hike',
  'Bedtime Story with Stuffed Bunny',
  'Morning Sunbeams & Baby Laughs',
  'Grandma Teaching Cookie Baking',
  'Splashing in the Summer Wading Pool',
  'Tokyo Cherry Blossom Afternoon',
  'Snow Day in Lake Tahoe Pines',
  'Dad Piggyback Ride in Central Park',
  'Beachside Sandcastle Construction',
  'Sleepy Afternoon Stroller Nap',
  'Autumn Leaves in Banff Valley',
  'Holiday Lights in Paris Square',
  'Little Artist Finger Painting Canvas',
  'Sunny Picnic Under the Oak Tree',
  'First Train Ride to the Coast',
  'Mom & Daughter Flower Crown Making',
  'Stargazing from the Backyard Tent',
  'Puppy Cuddles by the Fireplace',
  'Strawberry Picking at Sunny Orchard',
  'Music Class Shaker Dance Solo',
];

const CATEGORIES: Array<PhotoMemoryItem['category']> = [
  'Milestones',
  'Outdoor Adventures',
  'Bedtime Stories',
  'Celebrations',
  'Travel',
  'Everyday Joy',
];

const PEOPLE_SETS = [
  ['Charleigh', 'Mom', 'Dad'],
  ['Charleigh', 'Bella the Golden'],
  ['Charleigh', 'Mom'],
  ['Charleigh', 'Dad'],
  ['Charleigh', 'Grandma'],
  ['Charleigh', 'Friends'],
  ['Mom', 'Dad'],
  ['Charleigh'],
];

const TAG_POOL = [
  'golden hour', 'sunshine', 'milestone', 'laughter', 'nature',
  'ocean', 'puppy', 'birthday', 'vacation', 'spring', 'winter',
  'firsts', 'cozy', 'storytime', 'hiking', 'beach', 'tokyo',
  'paris', 'picnic', 'baking', 'holiday',
];

// High quality curated Unsplash photography URLs with diverse memory themes
const CURATED_IMAGE_URLS = [
  'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1511988617509-a57c8a288659?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800&auto=format&fit=crop&q=80',
];

export function generateSampleAlbum(count = 120): PhotoMemoryItem[] {
  const items: PhotoMemoryItem[] = [];
  const baseTime = Date.now() - count * 86400000 * 2.5;

  for (let i = 0; i < count; i++) {
    const titleTemplate = MEMORY_TITLES[i % MEMORY_TITLES.length];
    const seqNum = Math.floor(i / MEMORY_TITLES.length) + 1;
    const title = seqNum > 1 ? `${titleTemplate} (Vol. ${seqNum})` : titleTemplate;

    const loc = SAMPLE_LOCATIONS[i % SAMPLE_LOCATIONS.length];
    const category = CATEGORIES[i % CATEGORIES.length];
    const people = PEOPLE_SETS[i % PEOPLE_SETS.length];
    const hue = Math.floor((i * (360 / Math.min(count, 360))) % 360);
    const dominantColor = `hsl(${hue}, 80%, 60%)`;
    const timestamp = baseTime + i * 86400000 * 2.5 + (i % 7) * 3600000;

    const tagA = TAG_POOL[i % TAG_POOL.length];
    const tagB = TAG_POOL[(i + 3) % TAG_POOL.length];
    const tagC = loc.name.split(',')[0].toLowerCase().trim();

    const imageUrl = CURATED_IMAGE_URLS[i % CURATED_IMAGE_URLS.length];

    items.push({
      id: `mem_${i}_${timestamp}`,
      title,
      description: `Cherished memory captured at ${loc.name} with ${people.join(', ')}.`,
      timestamp,
      thumbnailUrl: imageUrl,
      highResUrl: imageUrl,
      dominantColor,
      hue,
      aspectRatio: 1.33,
      exif: {
        cameraMake: (i % 2 === 0) ? 'Sony Alpha A7 IV' : 'Google Pixel 9 Pro',
        cameraModel: (i % 2 === 0) ? 'FE 35mm F1.4 GM' : 'Main 50MP Wide',
        focalLength: 24 + (i % 6) * 12,
        fNumber: (i % 3 === 0) ? 1.4 : 2.8,
        iso: 100 * (1 + (i % 6)),
        exposureTime: `1/${250 + (i % 5) * 200}s`,
        latitude: loc.lat,
        longitude: loc.lng,
        locationName: loc.name,
      },
      people,
      tags: ['family', 'memory', category.toLowerCase(), tagA, tagB, tagC],
      category,
      sentimentScore: 0.6 + 0.35 * Math.sin(i * 0.5),
      currentPos: [0, 0, 0],
      targetPos: [0, 0, 0],
      rotation: [0, 0, 0],
      targetRotation: [0, 0, 0],
      matchScore: 1.0,
      isHighlighted: false,
      isSelected: false,
      opacity: 1.0,
      scale: 1.0,
    });
  }

  return items;
}
