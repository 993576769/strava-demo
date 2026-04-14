import type { RecordService } from 'pocketbase'
import type { Activity, ActivityStream, ArtJob, ArtPromptTemplate, ArtResult, StravaConnection, SyncEvent, TypedPocketBase, User } from '@/types/pocketbase'
import PocketBase from 'pocketbase'
import { Collections } from '@/types/pocketbase.generated'

const getPBUrl = () => {
  if (import.meta.env.VITE_PB_URL) { return import.meta.env.VITE_PB_URL }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return '/'
}

export const pb = new PocketBase(getPBUrl()) as TypedPocketBase

export const stravaConnectionsCollection = () => pb.collection(Collections.StravaConnections) as RecordService<StravaConnection>
export const activitiesCollection = () => pb.collection(Collections.Activities) as RecordService<Activity>
export const activityStreamsCollection = () => pb.collection(Collections.ActivityStreams) as RecordService<ActivityStream>
export const artJobsCollection = () => pb.collection(Collections.ArtJobs) as RecordService<ArtJob>
export const artPromptTemplatesCollection = () => pb.collection(Collections.ArtPromptTemplates) as RecordService<ArtPromptTemplate>
export const artResultsCollection = () => pb.collection(Collections.ArtResults) as RecordService<ArtResult>
export const syncEventsCollection = () => pb.collection(Collections.SyncEvents) as RecordService<SyncEvent>
export const usersCollection = () => pb.collection(Collections.Users) as RecordService<User>

if (import.meta.env.DEV) {
  pb.autoCancellation(false)
}
