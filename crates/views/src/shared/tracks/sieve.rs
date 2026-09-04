use music::Track;

#[derive(Clone, Copy, Default, PartialEq)]
pub(crate) struct TrackSieve {
    pub duration: Option<(f32, f32)>,
    pub explicit: bool,
    pub playable: bool,
}

impl TrackSieve {
    pub(crate) fn active(&self) -> bool {
        self.duration.is_some() || self.explicit || self.playable
    }

    pub(super) fn keeps(&self, track: &Track) -> bool {
        if self.explicit && !track.explicit {
            return false;
        }
        if self.playable && !track.playable {
            return false;
        }
        match self.duration {
            Some((low, high)) => {
                let seconds = track.duration.as_secs_f32();
                seconds >= low - 0.5 && seconds <= high + 0.5
            }
            None => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::TrackSieve;
    use crate::shared::tracks::fixture::track;

    #[test]
    fn duration_bounds_are_inclusive() {
        let sieve = TrackSieve {
            duration: Some((60., 180.)),
            ..TrackSieve::default()
        };

        assert!(sieve.active());
        assert!(sieve.keeps(&track(60, false, true)));
        assert!(sieve.keeps(&track(180, false, true)));
        assert!(sieve.keeps(&track(120, false, true)));
        assert!(!sieve.keeps(&track(59, false, true)));
        assert!(!sieve.keeps(&track(181, false, true)));
    }

    #[test]
    fn every_axis_must_pass() {
        let sieve = TrackSieve {
            duration: Some((60., 180.)),
            explicit: true,
            playable: true,
        };

        assert!(sieve.keeps(&track(120, true, true)));
        assert!(!sieve.keeps(&track(120, true, false)));
        assert!(!sieve.keeps(&track(400, true, true)));
    }
}
