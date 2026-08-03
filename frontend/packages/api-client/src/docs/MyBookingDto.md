# MyBookingDto


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | [**ApiBookingStreamGetLocationIdParameter**](ApiBookingStreamGetLocationIdParameter.md) |  | [default to undefined]
**locationName** | **string** |  | [default to undefined]
**therapistName** | **string** |  | [default to undefined]
**startTime** | **string** |  | [default to undefined]
**endTime** | **string** |  | [default to undefined]
**status** | **string** |  | [default to undefined]
**treatments** | [**Array&lt;MyBookingTreatmentDto&gt;**](MyBookingTreatmentDto.md) |  | [default to undefined]

## Example

```typescript
import { MyBookingDto } from './api';

const instance: MyBookingDto = {
    id,
    locationName,
    therapistName,
    startTime,
    endTime,
    status,
    treatments,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
