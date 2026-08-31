import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  type User 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc,
  deleteDoc, 
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Authentication instance
export const auth = getAuth(app);

// Firestore instance (using custom databaseId if configured)
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Google Auth Provider with Photos Scopes requested
export const createGoogleAuthProvider = () => {
  const provider = new GoogleAuthProvider();
  // Request Google Photos Readonly and Library scopes directly during Google Sign-in!
  provider.addScope('https://www.googleapis.com/auth/photoslibrary.readonly');
  provider.addScope('https://www.googleapis.com/auth/photoslibrary');
  provider.addScope('https://www.googleapis.com/auth/photopicker.mediaitems.readonly');
  provider.addScope('https://www.googleapis.com/auth/photoslibrary.sharing');
  provider.addScope('https://www.googleapis.com/auth/userinfo.email');
  provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
  provider.setCustomParameters({
    prompt: 'consent select_account',
    access_type: 'offline',
  });
  return provider;
};

/**
 * Sign in with Google Popup and obtain both Firebase user and Google OAuth access token
 */
export async function signInWithGooglePhotos(): Promise<{ user: User; accessToken?: string }> {
  const provider = createGoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    
    // Store access token in localStorage for Photos API calls
    if (accessToken) {
      localStorage.setItem('gp_oauth_access_token', accessToken);
      localStorage.setItem('gp_oauth_token_timestamp', Date.now().toString());
    }

    // Save/Update user profile in Firestore
    if (result.user) {
      await setDoc(doc(db, 'users', result.user.uid), {
        id: result.user.uid,
        email: result.user.email || '',
        displayName: result.user.displayName || '',
        photoURL: result.user.photoURL || '',
        lastLoginAt: new Date().toISOString()
      }, { merge: true });
    }

    return { user: result.user, accessToken };
  } catch (error: any) {
    // If popup blocked or iframe restrictions, try redirect flow fallback
    console.error('Firebase Google Sign-In error:', error);
    throw error;
  }
}

/**
 * Sign out of Firebase and clear cached Google access token
 */
export async function signOutUser(): Promise<void> {
  localStorage.removeItem('gp_oauth_access_token');
  localStorage.removeItem('gp_oauth_token_timestamp');
  await firebaseSignOut(auth);
}

export { 
  app,
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc,
  deleteDoc, 
  query, 
  where,
  onSnapshot,
  onAuthStateChanged
};
export type { User };
