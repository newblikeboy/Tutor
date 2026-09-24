import type { Schema } from './api'
export type ApplicationProfile = Schema['TutorApplication']
export const applicationSteps = [
  'about',
  'education',
  'areas',
  'availability',
  'approach',
  'review',
] as const
export const weekDays = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]
export function newArea(): Schema['RequestedTeachingArea'] {
  return {
    id: crypto.randomUUID(),
    subject: '',
    minClass: 0,
    maxClass: 0,
    boards: [],
    languages: [],
    modes: [],
    priorExperience: '',
  }
}
export function emptyApplication(name: string, noticeVersion: string): ApplicationProfile {
  return {
    schemaVersion: 1,
    about: {
      fullName: name,
      displayName: '',
      mobile: '',
      city: '',
      locality: '',
      pin: '',
      photoFileId: '',
      communicationLanguages: [],
    },
    education: {
      qualification: '',
      specialisation: '',
      institution: '',
      completionYear: 0,
      pursuing: '',
      programme: '',
      currentInstitution: '',
      currentStage: '',
      expectedCompletion: '',
      additional: '',
      newToTutoring: false,
      experienceYears: 0,
      experienceMonths: 0,
      settings: [],
      summary: '',
      occupation: '',
      outsideWork: '',
      resumeFileId: '',
      educationFileIds: [],
    },
    teachingAreas: [],
    firstAreaId: '',
    availability: {
      timezone: 'Asia/Kolkata',
      slots: [],
      earliestStart: '',
      weeklyHours: 0,
      maxStudents: 0,
      durations: [],
      period: '',
      untilDate: '',
      interruptions: '',
      home: { localities: [], travelKm: 0, charges: '', bufferMinutes: 0 },
      online: {
        device: '',
        camera: '',
        microphone: '',
        internet: '',
        privateSpace: '',
        screenSharing: '',
        digitalWriting: '',
      },
    },
    approach: {
      introduction: '',
      scenario: '',
      understanding: '',
      demonstration: 'live',
      demoAreaId: '',
      demoTopic: '',
      demoFileId: '',
      worksheetFileId: '',
      assessmentSlots: [],
    },
    fees: { preference: 'staff', sessionMinutes: 60, rates: [], comments: '' },
    declarations: {
      accuracy: false,
      conduct: false,
      dataUse: false,
      marketing: false,
      noticeVersion,
    },
  }
}
export function fieldStep(key: string) {
  if (key === 'about.locality' || key === 'about.pin') return 3
  if (key.startsWith('teachingAreas') || key === 'firstAreaId') return 2
  return Math.max(
    0,
    ['about', 'education', '', 'availability', 'approach', 'declarations'].indexOf(
      key.split('.')[0],
    ),
  )
}
export function applicationDefaults(
  application: Schema['Application'] | null,
  name: string,
  noticeVersion: string,
) {
  if (application?.profile)
    return {
      ...application.profile,
      fees: { preference: 'staff', sessionMinutes: 60, rates: [], comments: '' },
      about: {
        ...application.profile.about,
        photoFileId: application.profile.about.photoFileId ?? '',
      },
      education: {
        ...application.profile.education,
        educationFileIds: application.profile.education.educationFileIds ?? [],
      },
    }
  const profile = emptyApplication(application?.name || name, noticeVersion)
  if (application) {
    profile.education.additional = application.education
    profile.education.experienceYears = application.experience
    profile.approach.introduction = application.approach
  }
  return profile
}
