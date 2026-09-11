# CommissionRuleRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**locationId** | **number** |  | [default to undefined]
**therapistId** | **number** |  | [default to undefined]
**type** | **string** |  | [default to undefined]
**rate** | **number** |  | [default to undefined]
**hourlyRate** | **number** |  | [optional] [default to 0]
**overtimeThresholdHours** | **number** |  | [optional] [default to 40]
**overtimeRateMultiplier** | **number** |  | [optional] [default to 1.5]

## Example

```typescript
import { CommissionRuleRequest } from './api';

const instance: CommissionRuleRequest = {
    locationId,
    therapistId,
    type,
    rate,
    hourlyRate,
    overtimeThresholdHours,
    overtimeRateMultiplier,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
