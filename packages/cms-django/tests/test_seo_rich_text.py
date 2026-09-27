from digitalafarin_cms.apps.seo.views import _seo_block_metrics


def test_rich_text_metrics_use_plain_text_once_and_inspect_doc_structure():
    blocks = [
        {
            "id": "rich-1",
            "type": "rich_text",
            "data": {
                "text": "focus phrase body",
                "html": '<h2>focus phrase heading</h2><p><a href="/inside/">internal</a></p>',
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "heading",
                            "attrs": {"level": 2},
                            "content": [{"type": "text", "text": "focus phrase heading"}],
                        },
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "internal",
                                    "marks": [{"type": "link", "attrs": {"href": "/inside/"}}],
                                }
                            ],
                        },
                        {"type": "image", "attrs": {"src": "/hero.jpg", "alt": ""}},
                    ],
                },
            },
        }
    ]

    metrics = _seo_block_metrics(blocks)

    assert metrics["text"] == "focus phrase body"
    assert "heading" not in metrics["text"]
    assert metrics["h1_count"] == 0
    assert metrics["h2_text"] == "focus phrase heading"
    assert metrics["image_count"] == 1
    assert metrics["missing_alt"] == 1
    assert metrics["internal_links"] == 1


def test_legacy_block_metrics_still_work():
    blocks = [
        {"type": "heading", "data": {"level": 1, "text": "Title"}},
        {"type": "heading", "data": {"level": 2, "text": "Focus section"}},
        {"type": "image", "data": {"src": "/hero.jpg", "alt": "Hero"}},
        {"type": "link", "data": {"url": "/inside/"}},
    ]

    metrics = _seo_block_metrics(blocks)

    assert metrics["h1_count"] == 1
    assert metrics["h2_text"] == "focus section"
    assert metrics["image_count"] == 1
    assert metrics["missing_alt"] == 0
    assert metrics["internal_links"] == 1
