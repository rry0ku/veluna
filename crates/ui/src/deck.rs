use std::ops::Range;

use gpui::prelude::*;
use gpui::{AnyElement, App, Div, ElementId, Pixels, StyleRefinement, Window, div};

use crate::table::Viewport;

type Draw = Box<dyn Fn(usize, &mut Window, &mut App) -> AnyElement>;
type Measure = Box<dyn Fn(Pixels, &mut Window, &mut App)>;

#[derive(IntoElement)]
pub struct Deck {
    base: Div,
    id: ElementId,
    viewport: Viewport,
    rows: Vec<Pixels>,
    gap: Pixels,
    across: bool,
    draw: Option<Draw>,
    measure: Option<Measure>,
}

impl Deck {
    #[track_caller]
    pub fn new(id: impl Into<ElementId>) -> Self {
        Self {
            base: div(),
            id: id.into(),
            viewport: Viewport::default(),
            rows: Vec::new(),
            gap: Pixels::ZERO,
            across: false,
            draw: None,
            measure: None,
        }
    }

    pub fn across(mut self) -> Self {
        self.across = true;
        self
    }

    pub fn viewport(mut self, viewport: Viewport) -> Self {
        self.viewport = viewport;
        self
    }

    pub fn rows(mut self, rows: impl IntoIterator<Item = Pixels>) -> Self {
        self.rows = rows.into_iter().collect();
        self
    }

    pub fn gap(mut self, gap: Pixels) -> Self {
        self.gap = gap;
        self
    }

    pub fn draw(
        mut self,
        draw: impl Fn(usize, &mut Window, &mut App) -> AnyElement + 'static,
    ) -> Self {
        self.draw = Some(Box::new(draw));
        self
    }

    pub fn on_measure(mut self, measure: impl Fn(Pixels, &mut Window, &mut App) + 'static) -> Self {
        self.measure = Some(Box::new(measure));
        self
    }

    pub fn tops(rows: &[Pixels], gap: Pixels) -> Vec<Pixels> {
        tops(rows, gap)
    }

    pub fn at(rows: &[Pixels], gap: Pixels, offset: Pixels) -> (usize, Pixels) {
        if rows.is_empty() {
            return (0, Pixels::ZERO);
        }

        let tops = tops(rows, gap);
        let index = passed(&tops, rows, offset).min(rows.len() - 1);
        (index, (offset - tops[index]).max(Pixels::ZERO))
    }
}

impl Styled for Deck {
    fn style(&mut self) -> &mut StyleRefinement {
        self.base.style()
    }
}

impl RenderOnce for Deck {
    fn render(self, window: &mut Window, cx: &mut App) -> impl IntoElement {
        let Self {
            mut base,
            id,
            viewport,
            rows,
            gap,
            across,
            draw,
            measure,
        } = self;

        let tops = tops(&rows, gap);
        let shown = span(&tops, &rows, viewport);
        let overrides = std::mem::take(base.style());
        let first = tops.get(shown.start).copied().unwrap_or(Pixels::ZERO);

        let base = base.when_some(measure, |this, measure| {
            this.on_children_prepainted(move |bounds, window, cx| {
                let Some(head) = bounds.first() else {
                    return;
                };
                let start = match across {
                    true => head.origin.x,
                    false => head.origin.y,
                };
                measure(start - first, window, cx);
            })
        });
        let reach = extent(&rows, gap);

        let mut deck = base.id(id).relative().when_else(
            across,
            |this| this.h_full().w(reach),
            |this| this.w_full().h(reach),
        );
        deck.style().refine(&overrides);

        match draw {
            None => deck,
            Some(draw) => deck.children(shown.map(|index| {
                div()
                    .absolute()
                    .when_else(
                        across,
                        |this| this.left(tops[index]).top_0().h_full().w(rows[index]),
                        |this| this.top(tops[index]).left_0().w_full().h(rows[index]),
                    )
                    .overflow_hidden()
                    .child(draw(index, window, cx))
            })),
        }
    }
}

fn tops(rows: &[Pixels], gap: Pixels) -> Vec<Pixels> {
    let mut top = Pixels::ZERO;
    rows.iter()
        .map(|height| {
            let start = top;
            top += *height + gap;
            start
        })
        .collect()
}

fn extent(rows: &[Pixels], gap: Pixels) -> Pixels {
    match rows.is_empty() {
        true => Pixels::ZERO,
        false => {
            rows.iter()
                .fold(Pixels::ZERO, |total, height| total + *height)
                + gap * (rows.len() - 1) as f32
        }
    }
}

fn span(tops: &[Pixels], rows: &[Pixels], viewport: Viewport) -> Range<usize> {
    if tops.is_empty() {
        return 0..0;
    }

    let bottom = viewport.top + viewport.height;
    let first = passed(tops, rows, viewport.top);
    let last = tops.partition_point(|top| *top < bottom);

    first..last.max(first)
}

fn passed(tops: &[Pixels], rows: &[Pixels], top: Pixels) -> usize {
    let mut low = 0;
    let mut high = tops.len();
    while low < high {
        let mid = (low + high) / 2;
        match tops[mid] + rows[mid] <= top {
            true => low = mid + 1,
            false => high = mid,
        }
    }
    low
}

#[cfg(test)]
mod tests {
    use gpui::px;

    use super::{Deck, extent, span, tops};
    use crate::table::Viewport;

    fn heights(count: usize, height: f32) -> Vec<gpui::Pixels> {
        (0..count).map(|_| px(height)).collect()
    }

    #[test]
    fn tops_stack_rows_with_gaps() {
        let rows = heights(3, 100.);

        assert_eq!(tops(&rows, px(10.)), [px(0.), px(110.), px(220.)]);
    }

    #[test]
    fn extent_covers_every_row_and_the_gaps_between() {
        assert_eq!(extent(&heights(3, 100.), px(10.)), px(320.));
        assert_eq!(extent(&heights(1, 100.), px(10.)), px(100.));
        assert_eq!(extent(&[], px(10.)), px(0.));
    }

    #[test]
    fn span_covers_the_visible_rows() {
        let rows = heights(20, 100.);
        let tops = tops(&rows, px(0.));

        let shown = span(
            &tops,
            &rows,
            Viewport {
                top: px(500.),
                height: px(200.),
            },
        );

        assert!(shown.contains(&5));
        assert!(shown.contains(&6));
        assert!(!shown.contains(&9));
    }

    #[test]
    fn span_starts_at_the_top_of_a_short_deck() {
        let rows = heights(2, 100.);
        let tops = tops(&rows, px(0.));

        assert_eq!(
            span(
                &tops,
                &rows,
                Viewport {
                    top: px(0.),
                    height: px(800.),
                }
            ),
            0..2
        );
    }

    #[test]
    fn at_finds_the_row_under_an_offset() {
        let rows = heights(4, 100.);

        assert_eq!(Deck::at(&rows, px(10.), px(0.)), (0, px(0.)));
        assert_eq!(Deck::at(&rows, px(10.), px(150.)), (1, px(40.)));
        assert_eq!(Deck::at(&rows, px(10.), px(105.)), (1, px(0.)));
        assert_eq!(Deck::at(&rows, px(10.), px(9000.)), (3, px(8670.)));
        assert_eq!(Deck::at(&[], px(10.), px(50.)), (0, px(0.)));
    }

    #[test]
    fn span_is_empty_without_rows() {
        assert_eq!(
            span(
                &[],
                &[],
                Viewport {
                    top: px(0.),
                    height: px(800.),
                }
            ),
            0..0
        );
    }
}
