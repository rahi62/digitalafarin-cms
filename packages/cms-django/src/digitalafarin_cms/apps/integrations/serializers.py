from rest_framework import serializers
from .models import WebhookEndpoint
class WebhookEndpointSerializer(serializers.ModelSerializer):
    class Meta: model=WebhookEndpoint; fields="__all__"; extra_kwargs={"secret":{"write_only":True}}
